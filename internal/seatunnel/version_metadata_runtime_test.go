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

package seatunnel

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestRuntimeVersionSources_doNotUseScatteredDefaultLiteral(t *testing.T) {
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("failed to resolve current test file path")
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(currentFile), "..", ".."))
	targetFiles := []string{
		"internal/apps/installer/service.go",
		"internal/apps/plugin/service.go",
		"agent/cmd/main.go",
		"agent/internal/installer/manager.go",
		"frontend/hooks/use-plugin.ts",
		"frontend/hooks/use-installer.ts",
		"frontend/components/common/cluster/ClusterDeployWizard.tsx",
		"frontend/components/common/plugin/PluginMain.tsx",
		"frontend/components/common/installer/UploadPackageDialog.tsx",
	}

	for _, targetFile := range targetFiles {
		content, err := os.ReadFile(filepath.Join(repoRoot, targetFile))
		if err != nil {
			t.Fatalf("failed to read %s: %v", targetFile, err)
		}
		for lineNo, line := range strings.Split(string(content), "\n") {
			trimmed := strings.TrimSpace(line)
			if strings.HasPrefix(trimmed, "//") || strings.HasPrefix(trimmed, "/*") || strings.HasPrefix(trimmed, "*") || strings.HasPrefix(trimmed, "*/") {
				continue
			}
			if strings.Contains(line, "2.3.12") {
				t.Fatalf("found scattered default version literal in %s:%d", targetFile, lineNo+1)
			}
		}
	}
}
