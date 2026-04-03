## Relevant Specs
- .trellis/spec/guides/cross-layer-thinking-guide.md: sync studio 涉及 task/api/runtime/frontend 多层数据流，需先定义边界契约。
- .trellis/spec/backend/directory-structure.md: 新后端功能应放入 internal/apps/sync/，并在 internal/router/router.go 统一注册。
- .trellis/spec/backend/database-guidelines.md: 新持久化实体需走 GORM AutoMigrate，并在 repository 中统一使用 WithContext(ctx)。
- .trellis/spec/backend/error-handling.md: handler 输出统一 { error_msg, data }，领域错误要映射为稳定 HTTP 状态码。
- .trellis/spec/frontend/api-and-services.md: 前端后续必须通过 lib/services/sync 访问后端，不能直接散用 fetch。

## Code Patterns Found
- 路由注册模式: internal/router/router.go
- 领域 model + service + handler 模式: internal/apps/cluster/
- 轻量任务 API 模式: internal/apps/task/
- preview/result decode 模式: internal/apps/cluster/runtime_storage_preview.go
- 数据库迁移入口: internal/db/migrator/migrator.go

## SeaTunnel API Notes
- SeaTunnel Engine REST API V2 支持 POST /submit-job, POST /submit-job/upload, GET /job-info/:jobId, POST /stop-job, GET /logs。
- MVP 可以先围绕 submit / status / stop 三条链路建 control plane，preview 则复用本地 pipeline rewrite + 单独 run_type=preview 的实例模型。
- SeaTunnel 恢复任务前期按 recovery behavior 建模，不引入类似 Dinky savepoint registry 的独立表。

## Files to Modify
- internal/apps/sync/: 新建 sync 模块（model/repository/service/handler/err/types）
- internal/db/migrator/migrator.go: 注册 sync 模块模型
- internal/router/router.go: 注册 /api/v1/sync/* 路由与依赖
- frontend/lib/services/sync/: 后续新增 sync service
- frontend/app/(main)/...: 后续新增 sync studio 页面骨架

## Code-Spec Depth Check
- [x] Target code-spec files identified
- [x] Concrete contract identified: sync task / version / job instance + validate/dag/preview/submit/status API
- [x] Validation and error matrix identified: bad request / not found / conflict / runtime submit failed
- [x] Good/Base/Bad defined
  - Good: 合法任务可 validate、可生成 dag、可 submit
  - Base: 仅保存 draft，不提交
  - Bad: cluster 不存在、definition 非法、runtime submit 失败
