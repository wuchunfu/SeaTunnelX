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

import (
	"sync"
	"time"
)

// TaskEventType 表示升级任务事件流中的事件类型。
// TaskEventType represents the event type in the upgrade task event stream.
type TaskEventType string

const (
	TaskEventTypeSnapshot    TaskEventType = "snapshot"
	TaskEventTypeTaskUpdated TaskEventType = "task_updated"
	TaskEventTypeStepUpdated TaskEventType = "step_updated"
	TaskEventTypeNodeUpdated TaskEventType = "node_updated"
	TaskEventTypeLogAppended TaskEventType = "log_appended"
)

// TaskEvent 描述升级任务流向前端的增量事件。
// TaskEvent describes the incremental event streamed to the frontend for an upgrade task.
type TaskEvent struct {
	TaskID          uint            `json:"task_id"`
	EventType       TaskEventType   `json:"event_type"`
	Timestamp       time.Time       `json:"timestamp"`
	TaskStatus      ExecutionStatus `json:"task_status,omitempty"`
	StepStatus      ExecutionStatus `json:"step_status,omitempty"`
	NodeStatus      ExecutionStatus `json:"node_status,omitempty"`
	RollbackStatus  ExecutionStatus `json:"rollback_status,omitempty"`
	CurrentStep     StepCode        `json:"current_step,omitempty"`
	StepID          *uint           `json:"step_id,omitempty"`
	StepCode        StepCode        `json:"step_code,omitempty"`
	NodeExecutionID *uint           `json:"node_execution_id,omitempty"`
	HostID          uint            `json:"host_id,omitempty"`
	HostName        string          `json:"host_name,omitempty"`
	Level           LogLevel        `json:"level,omitempty"`
	LogEventType    LogEventType    `json:"log_event_type,omitempty"`
	Message         string          `json:"message,omitempty"`
	Error           string          `json:"error,omitempty"`
	CommandSummary  string          `json:"command_summary,omitempty"`
	FailureReason   string          `json:"failure_reason,omitempty"`
	RollbackReason  string          `json:"rollback_reason,omitempty"`
}

type taskEventHub struct {
	mu          sync.RWMutex
	subscribers map[uint]map[chan TaskEvent]struct{}
}

func newTaskEventHub() *taskEventHub {
	return &taskEventHub{
		subscribers: make(map[uint]map[chan TaskEvent]struct{}),
	}
}

func (h *taskEventHub) Subscribe(taskID uint) (<-chan TaskEvent, func()) {
	ch := make(chan TaskEvent, 128)

	h.mu.Lock()
	if _, ok := h.subscribers[taskID]; !ok {
		h.subscribers[taskID] = make(map[chan TaskEvent]struct{})
	}
	h.subscribers[taskID][ch] = struct{}{}
	h.mu.Unlock()

	return ch, func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		if taskSubscribers, ok := h.subscribers[taskID]; ok {
			if _, exists := taskSubscribers[ch]; exists {
				delete(taskSubscribers, ch)
				close(ch)
			}
			if len(taskSubscribers) == 0 {
				delete(h.subscribers, taskID)
			}
		}
	}
}

func (h *taskEventHub) Publish(event TaskEvent) {
	h.mu.RLock()
	taskSubscribers := h.subscribers[event.TaskID]
	for ch := range taskSubscribers {
		select {
		case ch <- event:
		default:
		}
	}
	h.mu.RUnlock()
}

// SubscribeTaskEvents 订阅指定任务的事件流。
// SubscribeTaskEvents subscribes to the event stream of a specific task.
func (s *Service) SubscribeTaskEvents(taskID uint) (<-chan TaskEvent, func()) {
	if s.events == nil {
		s.events = newTaskEventHub()
	}
	return s.events.Subscribe(taskID)
}

func (s *Service) publishTaskEvent(event TaskEvent) {
	if s.events == nil {
		return
	}
	if event.Timestamp.IsZero() {
		event.Timestamp = time.Now()
	}
	s.events.Publish(event)
}

func newTaskSnapshotEvent(task *UpgradeTask) TaskEvent {
	return TaskEvent{
		TaskID:         task.ID,
		EventType:      TaskEventTypeSnapshot,
		TaskStatus:     task.Status,
		RollbackStatus: task.RollbackStatus,
		CurrentStep:    task.CurrentStep,
		Message:        task.FailureReason,
		FailureReason:  task.FailureReason,
		RollbackReason: task.RollbackReason,
	}
}

func newTaskUpdatedEvent(task *UpgradeTask) TaskEvent {
	return TaskEvent{
		TaskID:         task.ID,
		EventType:      TaskEventTypeTaskUpdated,
		TaskStatus:     task.Status,
		RollbackStatus: task.RollbackStatus,
		CurrentStep:    task.CurrentStep,
		FailureReason:  task.FailureReason,
		RollbackReason: task.RollbackReason,
	}
}

func newStepUpdatedEvent(step *UpgradeTaskStep) TaskEvent {
	return TaskEvent{
		TaskID:     step.TaskID,
		EventType:  TaskEventTypeStepUpdated,
		StepID:     uintPtr(step.ID),
		StepCode:   step.Code,
		StepStatus: step.Status,
		Message:    step.Message,
		Error:      step.Error,
	}
}

func newNodeUpdatedEvent(node *UpgradeNodeExecution) TaskEvent {
	return TaskEvent{
		TaskID:          node.TaskID,
		EventType:       TaskEventTypeNodeUpdated,
		NodeExecutionID: uintPtr(node.ID),
		NodeStatus:      node.Status,
		CurrentStep:     node.CurrentStep,
		StepID:          node.TaskStepID,
		HostID:          node.HostID,
		HostName:        node.HostName,
		Message:         node.Message,
		Error:           node.Error,
	}
}

func newLogAppendedEvent(log *UpgradeStepLog) TaskEvent {
	return TaskEvent{
		TaskID:          log.TaskID,
		EventType:       TaskEventTypeLogAppended,
		StepID:          log.TaskStepID,
		StepCode:        log.StepCode,
		NodeExecutionID: log.NodeExecutionID,
		Level:           log.Level,
		LogEventType:    log.EventType,
		Message:         log.Message,
		CommandSummary:  log.CommandSummary,
	}
}

func uintPtr(value uint) *uint {
	v := value
	return &v
}
