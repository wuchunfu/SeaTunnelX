## Context

SeaTunnelX 已经具备升级所需的核心底座：本地 SeaTunnel 安装包、本地缓存的连接器、集群与节点拓扑、配置版本，以及由 Agent 驱动的安装 / 启停能力。当前缺失的是“升级编排层”。目前 Agent 级别的 `upgrade` 路径本质上接近“删除安装目录后重新安装”，这对于生产集群并不安全，因为它无法提供原子切换、持久化任务可见性以及可靠回滚。

结合现状分析，项目已经具备 60%~70% 的升级基础能力，但真正面向集群的一键升级 / 回滚 / 可视化执行链路还没有闭环。另一方面，截至当前规划基线，官方最新稳定版本仍然是 2.3.12，因此本阶段的重点不是“追更高上游版本”，而是建立一个可靠的受管升级体系。

当前还有三个必须显式处理的现实问题：
- `2.3.12` 默认值分散在 frontend / backend / agent 多处，版本能力未中心化。
- 安装目录默认就是 `/opt/seatunnel-{version}`，这天然更适合双目录切换，而不是原地覆盖。
- 内存态 task manager 不足以支撑可恢复、可审计、可翻页查询日志的升级任务。

相关干系人：
- 需要在不登录主机的前提下安全执行升级的平台运维人员
- 需要展示阶段 / 步骤 / 日志可视化的前端消费者
- 需要一条比当前“重装式升级”更安全路径的后端与 Agent 维护者

## Goals / Non-Goals

**Goals:**
- 为 SeaTunnel 集群提供受管升级工作流，覆盖预检查、计划、执行、校验与回滚全流程。
- 复用现有安装包、插件、配置、集群与 Agent 模块，而不是构建重复的存储与资产管道。
- 标准化升级资产模型，使升级从“散落调用多个 service”变成“围绕一个升级计划对象编排”。
- 将 checksum 校验提升为升级硬门禁，确保升级不再依赖可跳过的 verify。
- 持久化升级任务状态、步骤状态、节点状态与面向运维的日志，使任务在页面刷新或后端重启后仍可追踪。
- 以基于版本目录与可恢复备份的“版本切换”方式替代破坏性的原地升级行为。
- 收敛推荐版本 / 默认版本来源，替换分散的 `2.3.12` 硬编码默认值。
- 前端按“准备 / 合并 / 执行”三页形态落地升级体验。

**Non-Goals:**
- 不实现滚动升级或零停机升级。
- MVP 不实现自动 savepoint / 任务冻结编排。
- 不承诺超出目标版本安装包与配置模板支持范围之外的任意跨大版本兼容性。
- 不重建安装包或插件存储体系；现有存储仍是唯一事实来源。
- 不让新升级编排复用 legacy Agent `upgrade` 命令。

## Decisions

### 1. 引入独立的控制面升级编排器
新增一个专门的 upgrade orchestrator，负责升级预检查、计划生成、执行、回滚以及任务查询，而不是仅在现有 installer handler 上叠加逻辑。

**Why:** 升级需要持久化状态、多步骤编排、失败回滚，以及跨多个子系统的前端可见日志。现有 installer service 更偏向“单主机安装”，并不适合承担“集群级升级编排”。

**Alternatives considered:**
- 直接复用当前 installer 流程：放弃，因为它是 host 级的，无法建模集群级回滚与可见性。
- 让 Agent 独立负责整个升级流程：放弃，因为集群协调、任务持久化与 UI 可见性应属于控制面职责。

### 2. 采用双目录升级与受控切换
编排器将目标版本安装 / 解压到新的版本目录中（例如 `/opt/seatunnel-<targetVersion>`），保留当前版本目录作为回滚源，并只在配置、连接器与库同步完成、启停边界满足后再执行切换。

**Why:** 当前代码已默认使用版本化安装目录，这使双目录部署成为天然选择。这样可以避免当前 `RemoveAll(installDir)` 带来的危险，并让回滚路径可预测。

**Alternatives considered:**
- 原地覆盖：放弃，因为会破坏回滚安全性。
- 继续沿用当前卸载 / 重装式 upgrade handler：放弃，因为它不具备原子性，也无法保留旧版本现场。

### 3. 标准化升级资产模型与升级计划对象
升级计划将围绕统一对象建模，至少包含：
- `cluster_id`
- `source_version`
- `target_version`
- `package_manifest`
- `connector_manifest`
- `config_merge_plan`
- `node_targets`

其中：
- `package_manifest` 至少包含版本、文件标识、checksum、arch、来源、本地路径 / 分发方式
- `connector_manifest` 至少包含目标 connectors、依赖 lib、保留 / 替换策略
- `config_merge_plan` 至少包含 `base / local / target / resolved` 与冲突状态
- `node_targets` 至少包含节点 ID、主机 ID、角色、切换目标目录

**Why:** 只有先把升级资产对象标准化，升级才不再是“多个 service 的散落调用”，而能成为一个可重放、可审计、可回滚的编排过程。

**Alternatives considered:**
- 不建立统一资产模型，继续边执行边拼装参数：放弃，因为会让 precheck / plan / execute / rollback 之间的数据契约不稳定。

### 4. checksum 校验必须成为硬门禁
升级预检查、升级计划与升级执行都必须要求目标安装包具备可校验 checksum，并且校验通过。控制面必须把期望 checksum 显式传递给 Agent；升级流程中不允许出现“未提供 checksum 因而跳过 verify”的行为。

**Why:** 当前安装链路虽然有 verify 步骤，但在缺少 `ExpectedChecksum` 时会被跳过，这与升级设计文档要求的“校验失败应阻断升级”不一致。升级场景下必须提升为硬约束。

**Alternatives considered:**
- 保持 verify 为可选：放弃，因为这会把升级前风险推迟到执行期，且违背升级安全要求。

### 5. 在控制面持久化升级任务、步骤、节点执行与日志
升级执行状态将存储到独立的持久化表 / 模型中，而不是复用当前内存态 task manager。MVP 设计中的固定步骤编码将作为稳定契约。

**Why:** 升级任务必须支持后端重启恢复、分页 / 过滤查询，并为前端的日志 / 步骤 / 事件 API 提供稳定数据源。

**Alternatives considered:**
- 复用 `internal/apps/task/manager.go` 的内存实现：放弃，因为它不持久化，无法支撑长时间运行的升级流程。

### 6. 使用 Agent 原语，不再让新流程复用 legacy `upgrade`
控制面将调用显式的 Agent 动作来完成备份、解压、连接器 / lib 同步、配置应用、切换、恢复与校验；新的升级流程不会调用现有遗留 `upgrade` 命令，UI 也不应直接暴露该命令对应的产品能力。

建议新增或等价建模以下原语：
- `backup_install_dir`
- `extract_package_to_dir`
- `sync_connectors_manifest`
- `sync_lib_manifest`
- `apply_merged_config`
- `switch_install_dir`
- `restore_snapshot`
- `verify_cluster_health`
- `cleanup_old_version`

**Why:** 细粒度的 Agent 原语比单个黑盒 upgrade 命令更容易重试、记录日志与执行回滚。

**Alternatives considered:**
- 包装当前 Agent `upgrade` 命令：放弃，因为它本质上是 uninstall + install，无法提供安全的部分失败恢复能力。

### 7. 将配置合并视为执行前输入
计划阶段会计算 `base`、`local`、`target` 三类配置来源并识别冲突。MVP 中，执行前必须得到已解决的合并结果，否则 `MERGE_CONFIG` 步骤不得执行。

**Why:** 配置冲突是升级失败的主要风险之一。在执行前显式暴露冲突，可以避免在升级中途出现难以解释的问题。

**Alternatives considered:**
- 只在执行期自动合并：放弃，因为这会隐藏风险，也会增加回滚定位成本。

### 8. MVP 仅支持批次停机切换升级
编排器会停止相关集群节点，批次切换所有目标节点，再启动节点并执行健康检查与最小 smoke check。

**Why:** 这与现有产品分析一致，并且能够在当前生命周期能力上落地。

**Alternatives considered:**
- 按节点 / 角色滚动升级：延期到后续迭代。
- 对运行中作业做 savepoint 感知升级：延期到后续迭代。
- 热升级：延期到后续迭代。

### 9. 收敛版本默认值来源
推荐版本、默认版本与版本列表来源应由统一的版本元数据入口管理，并被 frontend / backend / agent 共同消费，替换当前散落在多处的 `2.3.12` 默认值。

**Why:** 当前版本默认值分散，短期虽然不影响功能，但中长期会放大维护成本，并使升级能力难以统一演进。

**Alternatives considered:**
- 暂时保留硬编码：放弃，因为这会让未来版本升级或推荐版本调整需要多点修改。

### 10. 前端按三页形态落地，而不是单一大 wizard
前端升级体验拆分为：
1. 升级准备页
2. 配置合并页
3. 升级执行页

**Why:** 升级涉及资产准备、配置冲突处理、执行与日志跟踪，这三类认知负担差异很大。过早收敛成一个单一 wizard 弹窗，会导致状态过多、可见性不足、后续难扩展。

**Alternatives considered:**
- 单个 wizard 弹窗：放弃，因为容易随着步骤与日志增加而失控。

## Risks / Trade-offs

- **[Risk] 升级任务模型会增加持久化复杂度** → Mitigation: 仅围绕升级任务、步骤、节点执行与日志记录设计最小闭环，并尽量复用现有审计 / 日志模式。
- **[Risk] Agent 原语扩展会增加命令面** → Mitigation: 以增量方式补充原语，同时保持现有 install / start / stop 行为对非升级流程不变。
- **[Risk] 双目录切换后可能与集群元数据漂移** → Mitigation: 仅在切换成功后更新 cluster / node 的版本与 install-dir 元数据，并在任务状态中同时记录 source / target 值。
- **[Risk] 自定义部署下的 connector / lib 同步规则可能差异较大** → Mitigation: 在计划阶段定义 manifest 驱动的同步规则，并在执行日志中记录每个保留 / 替换的工件。
- **[Risk] 配置冲突可能比预期更常见，导致执行频繁被阻塞** → Mitigation: 将冲突检测前移到 precheck / plan，并保存最终合并结果供重复执行复用。
- **[Risk] 健康检查不足以证明业务侧绝对安全** → Mitigation: MVP 仅承诺 cluster / node / process / API 就绪校验，并明确不覆盖 job 级 savepoint 校验。
- **[Risk] 统一版本元数据入口会触及多处默认值逻辑** → Mitigation: 先建立统一读取入口，再逐步替换 frontend / backend / agent 默认值调用点。

## Migration Plan

1. 为升级任务、任务步骤、节点执行与步骤日志新增持久化模型 / 表。
2. 建立统一版本元数据入口，替换散落的默认 `2.3.12` 值。
3. 为升级计划引入标准化资产模型与计划快照结构。
4. 新增控制面升级模块及其 API：precheck、plan、execute、rollback、task detail、steps、logs、event streaming。
5. 扩展 Agent，补充升级相关原语，同时保持现有 install / start / stop 命令兼容。
6. 通过专用升级 API 暴露新流程，不改写现有安装流程入口。
7. 前端按“三页形态”接入：准备页、配置合并页、执行页。
8. 在新流程稳定前，不让旧的 Agent `upgrade` 命令进入新执行链路，也不在 UI 直接暴露它；后续再视情况隐藏或废弃。
9. 该特性部署回滚策略：关闭升级 API 路由 / 前端入口，同时保留既有安装、包管理、插件管理能力不受影响。

## Open Questions

- 第一版 MVP 是否需要将 upgrade plan 独立持久化，还是直接把最终计划快照存放到 upgrade task 上即可？
- 回滚时应以软链 / current 指针切换恢复为主，还是同时做元数据回写？
- 第一版除了进程 / API 就绪之外，还需要哪些最小 smoke check？
- `SYNC_LIB` 与 `SYNC_CONNECTORS` 是否需要拆成两个 Agent 原语，还是一个 manifest 驱动同步命令就足够安全？
- 统一版本元数据入口最终应放在 installer service、独立 version catalog，还是共享 config/domain 模块中？
