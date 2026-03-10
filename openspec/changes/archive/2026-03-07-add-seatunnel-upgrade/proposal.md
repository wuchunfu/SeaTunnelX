## Why

SeaTunnelX 已经具备安装包管理、连接器管理、节点生命周期控制以及配置版本管理能力，但仍缺少一个面向纳管 SeaTunnel Engine 集群的、安全且完整的升级工作流。当前核心矛盾不是先追更高上游版本，而是把“受管升级能力”做扎实：把已有底座能力组织成可计划、可执行、可回滚、可观测的升级闭环。

## What Changes

- 新增独立的 SeaTunnel 集群升级编排层，而不是把升级继续实现为 install 的一个变体。
- 标准化升级资产模型，至少包含：
  - `package_manifest`：目标安装包、checksum、arch、来源与本地路径
  - `connector_manifest`：目标版本所需 connectors 与依赖 lib 清单
  - `config_merge_plan`：base / local / target 三方配置及合并结果
  - `node_targets`：本次升级涉及的节点与角色目标
- 先交付升级预检查与升级计划能力，使运维人员在执行前就能看到是否缺包、缺连接器、checksum 失败、架构不匹配、磁盘不足、节点离线或配置冲突。
- 交付批次原子升级 MVP：全量停机、全量切换、自动回滚、前端可见步骤与日志。
- 将 checksum 校验升级为硬门禁：缺少 checksum、checksum 不匹配或无法验证时，必须阻断升级。
- 明确新升级流程不得复用当前危险的 legacy Agent `upgrade` 路径；改为基于备份、解压、同步、切换、恢复等显式原语。
- 收敛当前分散在前后端与 Agent 中的 `2.3.12` 默认值，改由统一的版本元数据入口管理推荐版本与默认版本。
- 前端按“升级准备页 / 配置合并页 / 升级执行页”三页形态落地，而不是一开始收敛成单个笼统 wizard 弹窗。

## Capabilities

### New Capabilities
- `seatunnel-cluster-upgrade`：基于现有安装包、插件、配置与节点控制能力，对受管 SeaTunnel 集群提供升级预检查、计划生成、批次执行、自动回滚、日志可视化与状态查询能力。

### Modified Capabilities
- None.

## Impact

- 影响 `internal/apps/installer`、`internal/apps/plugin`、`internal/apps/cluster`、`internal/apps/config` 以及新增 upgrade orchestrator 相关后端模块。
- 影响 `agent/cmd` 与 `agent/internal/installer` 下的 Agent 命令面与升级执行路径，新增安全升级原语并隔离 legacy `upgrade`。
- 影响前端升级入口、配置冲突处理页、执行日志与任务状态展示页。
- 影响版本元数据的默认值来源，需要替换当前分散硬编码的 `2.3.12` 默认值。
- 继续复用现有安装包与插件存储目录，作为升级资产的唯一事实来源。
