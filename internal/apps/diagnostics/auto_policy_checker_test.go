/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package diagnostics

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/seatunnel/seatunnelX/internal/apps/cluster"
	monitoringapp "github.com/seatunnel/seatunnelX/internal/apps/monitoring"
	"gorm.io/gorm"
)

func newAutoPolicyTestService(t *testing.T, alertReader alertInstanceReader) (*Service, *Repository) {
	t.Helper()

	database, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := database.AutoMigrate(
		&SeatunnelErrorGroup{},
		&SeatunnelErrorEvent{},
		&ClusterInspectionReport{},
		&ClusterInspectionFinding{},
		&InspectionAutoPolicy{},
	); err != nil {
		t.Fatalf("auto migrate diagnostics models: %v", err)
	}

	repo := NewRepository(database)
	service := NewServiceWithRepository(repo, &fakeInspectionClusterReader{
		cluster: &cluster.Cluster{ID: 7, Name: "demo-cluster"},
		status: &cluster.ClusterStatusInfo{
			ClusterID:    7,
			ClusterName:  "demo-cluster",
			Status:       cluster.ClusterStatusRunning,
			HealthStatus: cluster.HealthStatusHealthy,
		},
	}, nil, alertReader)
	return service, repo
}

func TestAutoPolicyCheckerMatchJavaErrorCondition_matchesOOMAndMetaspace(t *testing.T) {
	checker := &AutoPolicyChecker{}

	matched, code := checker.matchJavaErrorCondition(
		InspectionConditionItem{
			Enabled:      true,
			TemplateCode: ConditionCodeJavaOOM,
		},
		"java.lang.outofmemoryerror",
		"java heap space",
	)
	if !matched || code != ConditionCodeJavaOOM {
		t.Fatalf("expected JAVA_OOM to match, got matched=%v code=%s", matched, code)
	}

	matched, code = checker.matchJavaErrorCondition(
		InspectionConditionItem{
			Enabled:      true,
			TemplateCode: ConditionCodeJavaMetaspace,
		},
		"java.lang.outofmemoryerror",
		"metaspace",
	)
	if !matched || code != ConditionCodeJavaMetaspace {
		t.Fatalf("expected JAVA_METASPACE to match, got matched=%v code=%s", matched, code)
	}
}

func TestServiceListBuiltinConditionTemplates_hidesUnsupportedTemplates(t *testing.T) {
	service, _ := newAutoPolicyTestService(t, nil)

	templates := service.ListBuiltinConditionTemplates()
	if len(templates) == 0 {
		t.Fatal("expected supported templates")
	}
	for _, template := range templates {
		if template == nil {
			continue
		}
		if !isConditionTemplateSupported(template.Code) {
			t.Fatalf("unexpected unsupported template in list: %s", template.Code)
		}
	}
}

func TestServiceCreateAutoPolicy_rejectsUnsupportedConditionTemplate(t *testing.T) {
	service, _ := newAutoPolicyTestService(t, nil)

	_, err := service.CreateAutoPolicy(context.Background(), 1, &CreateInspectionAutoPolicyRequest{
		Name:      "unsupported",
		ClusterID: 7,
		Enabled:   true,
		Conditions: InspectionConditionItems{
			{TemplateCode: ConditionCodeErrorSpike, Enabled: true},
		},
	})
	if err == nil {
		t.Fatal("expected unsupported template to be rejected")
	}
}

func TestAutoPolicyCheckerCheckScheduledPolicies_triggersInspectionOncePerCooldownWindow(t *testing.T) {
	service, repo := newAutoPolicyTestService(t, nil)
	policy := &InspectionAutoPolicy{
		ClusterID:       7,
		Name:            "scheduled",
		Enabled:         true,
		CooldownMinutes: 10,
		Conditions: InspectionConditionItems{
			{
				TemplateCode:     ConditionCodeScheduled,
				Enabled:          true,
				CronExprOverride: "* * * * *",
			},
		},
	}
	if err := repo.CreateAutoPolicy(context.Background(), policy); err != nil {
		t.Fatalf("CreateAutoPolicy returned error: %v", err)
	}

	checker := NewAutoPolicyChecker(repo, service)
	now := time.Date(2026, 3, 26, 2, 15, 0, 0, time.UTC)

	if err := checker.CheckScheduledPolicies(context.Background(), 7, now); err != nil {
		t.Fatalf("CheckScheduledPolicies returned error: %v", err)
	}
	if err := checker.CheckScheduledPolicies(context.Background(), 7, now); err != nil {
		t.Fatalf("CheckScheduledPolicies second run returned error: %v", err)
	}

	reports, total, err := repo.ListInspectionReports(context.Background(), &ClusterInspectionReportFilter{
		ClusterID: 7,
		Page:      1,
		PageSize:  10,
	})
	if err != nil {
		t.Fatalf("ListInspectionReports returned error: %v", err)
	}
	if total != 1 || len(reports) != 1 {
		t.Fatalf("expected exactly one inspection report, total=%d len=%d", total, len(reports))
	}
	if reports[0].TriggerSource != InspectionTriggerSourceAuto {
		t.Fatalf("expected auto trigger source, got %s", reports[0].TriggerSource)
	}
	if reports[0].RequestedBy != "auto-policy:1" {
		t.Fatalf("expected requester auto-policy:1, got %s", reports[0].RequestedBy)
	}
	if reports[0].AutoTriggerReason == "" || !strings.Contains(reports[0].AutoTriggerReason, "SCHEDULED") {
		t.Fatalf("expected schedule trigger reason, got %q", reports[0].AutoTriggerReason)
	}
}

func TestAutoPolicyCheckerCheckPrometheusPolicies_triggersInspectionWhenThresholdBreached(t *testing.T) {
	service, repo := newAutoPolicyTestService(t, &fakeInspectionAlertReader{
		data: &monitoringapp.AlertInstanceListData{
			Alerts: []*monitoringapp.AlertInstance{
				{
					AlertID:     "a-1",
					ClusterID:   "7",
					RuleKey:     "memory_usage_high",
					AlertName:   "Heap memory usage high",
					Status:      monitoringapp.AlertDisplayStatusFiring,
					LastSeenAt:  time.Now().UTC(),
					CreatedAt:   time.Now().UTC(),
					FiringAt:    time.Now().UTC(),
					ClusterName: "demo-cluster",
				},
			},
		},
	})
	policy := &InspectionAutoPolicy{
		ClusterID:       7,
		Name:            "heap-high",
		Enabled:         true,
		CooldownMinutes: 5,
		Conditions: InspectionConditionItems{
			{
				TemplateCode: ConditionCodePromHeapHigh,
				Enabled:      true,
			},
		},
	}
	if err := repo.CreateAutoPolicy(context.Background(), policy); err != nil {
		t.Fatalf("CreateAutoPolicy returned error: %v", err)
	}

	checker := NewAutoPolicyChecker(repo, service)
	if err := checker.CheckPrometheusPolicies(context.Background(), 7, time.Date(2026, 3, 26, 2, 20, 0, 0, time.UTC)); err != nil {
		t.Fatalf("CheckPrometheusPolicies returned error: %v", err)
	}

	reports, total, err := repo.ListInspectionReports(context.Background(), &ClusterInspectionReportFilter{
		ClusterID: 7,
		Page:      1,
		PageSize:  10,
	})
	if err != nil {
		t.Fatalf("ListInspectionReports returned error: %v", err)
	}
	if total != 1 || len(reports) != 1 {
		t.Fatalf("expected one prometheus-triggered inspection report, total=%d len=%d", total, len(reports))
	}
	if reports[0].AutoTriggerReason == "" || !strings.Contains(reports[0].AutoTriggerReason, "PROM_HEAP_HIGH") {
		t.Fatalf("expected PROM_HEAP_HIGH trigger reason, got %q", reports[0].AutoTriggerReason)
	}
}
