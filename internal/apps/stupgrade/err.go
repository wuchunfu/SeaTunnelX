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

package stupgrade

import "errors"

var (
	// ErrUpgradePlanNotFound 表示升级计划不存在。
	// ErrUpgradePlanNotFound indicates the upgrade plan does not exist.
	ErrUpgradePlanNotFound = errors.New("st upgrade plan not found")

	// ErrUpgradePlanNotReady 表示升级计划尚未满足执行条件。
	// ErrUpgradePlanNotReady indicates the upgrade plan is not ready for execution.
	ErrUpgradePlanNotReady = errors.New("st upgrade plan is not ready for execution")

	// ErrUpgradeTaskNotFound 表示升级任务不存在。
	// ErrUpgradeTaskNotFound indicates the upgrade task does not exist.
	ErrUpgradeTaskNotFound = errors.New("st upgrade task not found")

	// ErrUpgradeTaskStepNotFound 表示升级步骤不存在。
	// ErrUpgradeTaskStepNotFound indicates the upgrade step does not exist.
	ErrUpgradeTaskStepNotFound = errors.New("st upgrade task step not found")

	// ErrUpgradeNodeExecutionNotFound 表示节点执行记录不存在。
	// ErrUpgradeNodeExecutionNotFound indicates the node execution record does not exist.
	ErrUpgradeNodeExecutionNotFound = errors.New("st upgrade node execution not found")

	// ErrUpgradePlanSnapshotEmpty 表示升级计划缺少快照内容。
	// ErrUpgradePlanSnapshotEmpty indicates the upgrade plan snapshot is empty.
	ErrUpgradePlanSnapshotEmpty = errors.New("st upgrade plan snapshot is empty")
)
