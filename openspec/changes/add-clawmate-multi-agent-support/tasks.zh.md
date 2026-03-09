# 任务列表

## 1. Schema 和配置解析

- [x] 1.1 扩展 `packages/clawmate-companion/openclaw.plugin.json` 以支持 `config.agents.<agentId>` 覆写
- [x] 1.2 定义标量字段、嵌套对象和 `providers` 的合并语义
- [x] 1.3 实现基于 `ctx.agentId` 的运行时配置解析，并保持单 Agent 配置的向后兼容

## 2. Workspace 级人设注入

- [x] 2.1 更新 `before_agent_start` 以读取 `ctx.agentId` 和 `ctx.workspaceDir`
- [x] 2.2 修改 `SOUL.md` 路径解析逻辑，优先使用当前 agent workspace
- [x] 2.3 当运行时 workspace 不可用时，保持旧的全域 workspace 路径作为回退

## 3. 工具生命周期隔离

- [x] 3.1 将插件工具转换为 tool factory 注册
- [x] 3.2 将自拍准备状态移至 run 级闭包状态
- [x] 3.3 将角色准备状态移至 session 级状态，键为 `agentId:sessionId`
- [x] 3.4 在 `session_end` 时清理 session 级状态
- [x] 3.5 在 `before_reset` 时清理 session 级状态

## 4. 文档和验证

- [x] 4.1 在仓库文档中添加多 Agent 配置示例
- [x] 4.2 添加或更新测试，覆盖单 Agent 兼容性和多 Agent 隔离
- [x] 4.3 验证不同 Agent 可以使用不同角色和 provider，且无状态泄露
