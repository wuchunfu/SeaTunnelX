# Sync 模块表结构与 API 草案

## 数据表

### sync_tasks
- id
- name
- description
- cluster_id
- engine_version
- mode (streaming/batch)
- status (draft/published/archived)
- definition_json
- current_version
- created_by
- created_at
- updated_at

### sync_task_versions
- id
- task_id
- version
- definition_snapshot_json
- comment
- created_by
- created_at

### sync_job_instances
- id
- task_id
- task_version
- run_type (preview/run/recover)
- engine_job_id
- status (pending/running/success/failed/canceled)
- submit_spec_json
- result_preview_json
- error_message
- started_at
- finished_at
- created_by
- created_at
- updated_at

## API

### Tasks
- POST /api/v1/sync/tasks
- GET /api/v1/sync/tasks
- GET /api/v1/sync/tasks/:id
- PUT /api/v1/sync/tasks/:id
- POST /api/v1/sync/tasks/:id/publish

### Validate / DAG
- POST /api/v1/sync/tasks/:id/validate
- POST /api/v1/sync/tasks/:id/dag

### Preview / Submit
- POST /api/v1/sync/tasks/:id/preview
- POST /api/v1/sync/tasks/:id/submit

### Job Instances
- GET /api/v1/sync/jobs
- GET /api/v1/sync/jobs/:id
- POST /api/v1/sync/jobs/:id/cancel

## MVP 约束
- validate/dag/preview 先允许 stub/placeholder result，但接口结构必须稳定。
- submit 先记录 engine_job_id 与 instance 状态；后续再补 logs/metrics 深化。
- preview/result 先以 json blob 存储，后续再细分为 event/rows 表。
