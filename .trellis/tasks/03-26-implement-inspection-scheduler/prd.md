# 补全定时巡检自动调度

## Goal
补全 diagnostics 自动策略中 SCHEDULED（定时巡检）的实际执行链路，使用户配置 cron 后能够按计划自动触发巡检。

## Requirements
- 明确当前自动巡检中哪些条件已落地，哪些仍是占位实现
- 为 SCHEDULED 条件增加真正的后台调度器，而不是仅存储配置
- 调度器应扫描已启用策略，解析 cron，按 cluster/policy/condition 触发巡检
- 需要避免重复触发，至少具备基础 cooldown / 最近触发窗口保护
- 调度器要能在服务启动后自动运行，并且不影响现有 Java 错误自动触发链路
- 补充单测验证 cron 触发与去重逻辑

## Acceptance Criteria
- [ ] 配置包含 SCHEDULED 条件的 auto policy 后，后台会按 cron 触发 StartInspection
- [ ] 同一调度窗口不会出现明显重复触发
- [ ] Java 错误触发 auto policy 既有逻辑不受影响
- [ ] 至少补充 scheduler/trigger 相关测试

## Technical Notes
预计涉及 diagnostics service、auto policy checker、应用启动装配点以及一个长期运行的 scheduler 组件。尽量复用已有 auto policy 数据模型与 StartInspection 流程。
