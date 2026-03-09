# ClawMate 多 Agent 支持设计

## 背景

当前 `clawmate-companion` 只支持一份全局插件配置：

- 所有 Agent 共用同一个 `selectedCharacter`
- 所有 Agent 共用同一个 `defaultProvider`
- `SOUL.md` 固定写入同一个全局 workspace
- `prepareCalled` / `characterPrepareCalled` 是插件级全局状态

在 OpenClaw 已经支持多 Agent、每个 Agent 有独立 `workspace` 和 `binding` 的前提下，这会导致不同 Agent 之间的人设、工作空间和工具流程状态互相串扰。

## 目标

实现以下能力：

1. 不同 Agent 可以使用不同角色和不同 provider 配置。
2. 每个 Agent 的人格注入写入自己的 `workspace/SOUL.md`。
3. 自拍工具和角色创建工具的流程状态不再全局共享。
4. 单 Agent 旧配置继续可用，不强制迁移。

## 非目标

本方案不在插件内部重新实现 OpenClaw 的 `bindings` 路由。

原因：

- OpenClaw 已经负责把 `channel/account` 路由到最终的 `agentId`
- 插件 SDK 已经在运行时上下文中提供 `agentId` 和 `workspaceDir`
- 插件重复解析 `bindings` 会制造第二套路由逻辑，增加歧义和维护成本

因此，本方案以 `agentId` 为主键，以 `workspaceDir` 作为落盘路径来源。

## 源码验证结论

基于 `doc/reference-projects/openclaw` 中的 OpenClaw 源码，当前设计方案可以落地，且有几条实现约束已经可以明确：

### 1. 主路径必须依赖运行时上下文，而不是自己推导当前 Agent

OpenClaw 在插件运行时已经提供：

- tool context: `agentId` / `workspaceDir` / `sessionId` / `messageChannel` / `agentAccountId`
- hook context: `agentId` / `workspaceDir` / `sessionId` / `channelId`

这意味着：

- 当前 Agent 应直接通过 `ctx.agentId` 确定
- `SOUL.md` 落盘位置应直接通过 `ctx.workspaceDir` 确定
- `api.config.agents.list` 只适合作为 fallback 或诊断，不应作为主流程

### 2. Tool factory 方案是被 OpenClaw 原生支持的

OpenClaw 的插件 API 支持：

```ts
registerTool(tool: AnyAgentTool | OpenClawPluginToolFactory)
```

并且在构建工具时，会把当前 run 的上下文传给 factory。

这直接支持：

- `prepareCalled` 做成 run 级闭包状态
- 工具执行时按当前 `agentId/sessionId/workspaceDir` 解析配置

因此，当前插件从“静态注册工具”改为“按上下文生成工具”是可行的，而且是和宿主实现对齐的做法。

### 3. Hook 阶段不适合按账号再做一次路由

从 OpenClaw 的 hook 类型定义看，`before_agent_start` 等 agent hook 有 `channelId`，但没有稳定的 `accountId`。

这意味着：

- 插件不应在 hook 阶段依赖 `accountId -> agent` 再做二次匹配
- 正确职责分层仍然是：OpenClaw 先通过 bindings 选 Agent，插件再按 `agentId` 工作

工具上下文中虽然有 `agentAccountId`，但那更适合做工具执行阶段的附加逻辑，不适合作为整套人格注入和配置选择的主键。

### 4. `characterPrepareCalled` 可以按 session 清理

OpenClaw 提供：

- `session_start`
- `session_end`
- `before_reset`

其中 `session_end` 和 `before_reset` 的上下文都足够用于定位当前 Agent / Session。

这说明：

- `characterPrepareCalled` 适合存成 `Map<agentId:sessionId, State>`
- 可以在 `session_end` 和 `before_reset` 做清理
- 不需要继续依赖当前插件里的全局布尔变量

### 5. OpenClaw 不会自动给插件做 per-agent pluginConfig

源码确认 `api.pluginConfig` 只有插件自己那一份配置，不会自动展开成每个 Agent 一份。

因此：

- `config.agents.<agentId>` 的覆写机制必须由 `clawmate-companion` 自己实现
- 这不是优化项，而是多 Agent 配置隔离成立的前提

### 6. workspace 可以作为 fallback，但不应取代 `agentId`

OpenClaw 内部确实提供了按 workspace 反查 agent 的能力，这说明“按 workspace 识别 Agent”在技术上是可行的。

但它仍然更适合作为：

- fallback
- 调试校验
- 历史兼容逻辑

而不适合作为主设计。正式主键仍应是 `agentId`。

## 当前问题

### 1. 配置是全局单例

当前运行时配置来自 `plugins.entries.clawmate-companion.config`，只会合并成一份 `ClawMateConfig`。这意味着多 Agent 共享同一套角色和生图配置。

### 2. SOUL.md 路径写死

当前 `SOUL.md` 固定写到：

```text
~/.openclaw/workspace/SOUL.md
```

多 Agent 下应该写到各自的 `workspaceDir/SOUL.md`。

### 3. 工具流程状态是全局变量

当前存在两个插件级布尔变量：

- `prepareCalled`
- `characterPrepareCalled`

这会导致：

- 不同 Agent 之间互相影响
- 同一 Agent 的不同会话互相影响

### 4. 工具未按上下文构建

当前工具以静态方式注册，执行时没有显式按 `agentId/sessionId/workspaceDir` 做隔离。

## 设计原则

### 1. `agentId` 是主键

多 Agent 配置以 `agentId` 为索引，而不是以 `workspace` 为索引。

原因：

- `agentId` 是 OpenClaw 的一等标识
- `bindings` 最终匹配到的是 Agent，不是 workspace
- workspace 更适合作为文件落盘路径，而不是配置主键
- OpenClaw 已经在运行时上下文中直接提供 `agentId`，没有必要让插件自己回头解析 `agents.list`

### 2. `workspaceDir` 只负责文件路径

`workspaceDir` 用于确定：

- `SOUL.md` 写入位置
- 未来如有 Agent 私有素材，也可按 workspace 落盘

但不作为主要配置选择依据。

如果需要兼容历史实现，workspace 只应作为 fallback 匹配条件，而不应取代 `agentId`。

### 3. 保持向后兼容

旧配置仍然可用：

```json
{
  "selectedCharacter": "brooke-anime",
  "defaultProvider": "volcengine"
}
```

如果没有 `agents.<agentId>` 覆盖，就直接使用全局默认配置。

### 4. 状态按生命周期隔离

不同状态应按不同粒度隔离：

- `prepareCalled`：run 级别
- `characterPrepareCalled`：session 级别

不能简单把两者都做成全局或都做成 Agent 级别。

## 推荐配置结构

推荐将插件配置扩展为“全局默认值 + Agent 覆盖”：

```json
{
  "defaultProvider": "volcengine",
  "selectedCharacter": "brooke-anime",
  "fallback": {
    "enabled": true,
    "order": ["volcengine", "aliyun"]
  },
  "providers": {
    "aliyun": {
      "apiKey": "YOUR_KEY",
      "baseUrl": "https://dashscope.aliyuncs.com/api/v1",
      "model": "qwen-image-edit-max"
    },
    "volcengine": {
      "apiKey": "YOUR_KEY",
      "model": "doubao-seedream-4-5-251128"
    }
  },
  "agents": {
    "ding-main": {
      "selectedCharacter": "brooke-anime",
      "defaultProvider": "volcengine"
    },
    "ding-work": {
      "selectedCharacter": "brooke",
      "defaultProvider": "aliyun",
      "proactiveSelfie": {
        "enabled": true,
        "probability": 0.2
      }
    }
  }
}
```

### 合并规则

运行时配置合并顺序：

1. 插件内置默认值
2. 顶层全局配置
3. `agents[agentId]` 覆盖

建议规则：

- 标量字段直接覆盖
- `providers` 做浅合并或深合并
- `fallback` / `retry` / `proactiveSelfie` 做对象级合并
- `characterRoot` / `userCharacterRoot` 仍然支持绝对路径和相对路径解析

## 为什么不建议“角色数组 + workspace”

可以做，但不建议作为主方案。

例如这类结构：

```json
{
  "characters": [
    {
      "workspace": "C:\\Users\\Administrator\\.openclaw\\workspace-ding-main",
      "selectedCharacter": "brooke-anime"
    }
  ]
}
```

问题在于：

- `workspace` 是路径字符串，不是稳定业务标识
- 路径变更会导致配置失效
- 无法自然表达每个 Agent 的 provider、fallback、主动发图等整套配置
- 最终仍然要回到 `agentId` 才能跟 OpenClaw 的绑定关系对齐

如果未来确实需要，也只能作为辅助 fallback，而不应替代 `agentId` 主配置。

## 运行时设计

### 1. Hook 使用 `ctx.agentId` 和 `ctx.workspaceDir`

`before_agent_start` 应从第二个参数读取上下文：

- `ctx.agentId`
- `ctx.workspaceDir`

用途：

- 用 `ctx.agentId` 选择当前 Agent 配置
- 用 `ctx.workspaceDir` 决定 `SOUL.md` 落盘路径

### 2. Tool 使用 tool factory 注册

工具应改为：

```ts
api.registerTool((ctx) => {
  // ctx.agentId / ctx.sessionId / ctx.workspaceDir
  return toolOrTools;
});
```

原因：

- tool factory 每次构建工具集时都能获得当前运行上下文
- 可以自然拿到 `agentId`、`sessionId`、`workspaceDir`
- 便于将运行时状态做成 run/session 隔离

### 3. `resolveRuntimeConfig` 需要支持 scope

建议新增一个带上下文的配置解析入口，例如：

```ts
resolveRuntimeConfig(api, {
  agentId,
  workspaceDir,
});
```

职责：

- 读取插件全局配置
- 按 `agentId` 查找覆盖配置
- 合并出当前 Agent 的最终配置
- 保持旧配置兼容

### 4. `resolveSoulMdPath` 改为依赖 workspace

建议改成：

```ts
resolveSoulMdPath(workspaceDir?: string): string
```

规则：

1. 优先使用当前上下文传入的 `workspaceDir`
2. 如果没有，再回退到旧的 `~/.openclaw/workspace/SOUL.md`

这样可以保证：

- 多 Agent 场景正确隔离
- 单 Agent 旧行为不回归

## 状态隔离设计

### `prepareCalled`

用途：

- 强制 `clawmate_prepare_selfie -> clawmate_generate_selfie` 的调用顺序

建议粒度：

- run 级别

实现方式：

- 放在 tool factory 的闭包局部变量中

原因：

- 这两个工具通常在同一次 Agent run 内完成
- 不需要跨会话持久化
- 也不应该影响别的 Agent 或别的会话

### `characterPrepareCalled`

用途：

- 强制 `clawmate_prepare_character -> clawmate_create_character` 的调用顺序

建议粒度：

- session 级别

实现方式：

- 使用 `Map<string, SessionState>`
- key 建议为 `agentId:sessionId`

原因：

- 角色创建是多轮确认流程
- 用户可能在下一条消息才确认最终角色草稿
- 仅用 run 级闭包会导致流程中断

### 清理策略

建议在以下时机清理 session 状态：

- `session_end`
- `before_reset`

源码已经提供这两个 hook 所需的 session 上下文，因此该清理策略可以直接落地，避免状态无限积累。

## 代码改动清单

### `packages/clawmate-companion/openclaw.plugin.json`

需要新增 `agents` 配置结构的 schema，允许：

- `agents.<agentId>.selectedCharacter`
- `agents.<agentId>.defaultProvider`
- `agents.<agentId>.fallback`
- `agents.<agentId>.retry`
- `agents.<agentId>.proactiveSelfie`
- `agents.<agentId>.characterRoot`
- `agents.<agentId>.userCharacterRoot`
- `agents.<agentId>.providers`

### `packages/clawmate-companion/src/plugin.ts`

需要改动：

1. 扩展插件配置输入类型
2. 实现按 `agentId` 的配置合并
3. `before_agent_start` 改为读取 `ctx.agentId` / `ctx.workspaceDir`
4. `resolveSoulMdPath` 改为按 workspace 计算
5. `registerTool` 改为 tool factory
6. `prepareCalled` 改为 run 级闭包变量
7. `characterPrepareCalled` 改为 session 级状态表
8. 增加 `session_end` / `before_reset` 状态清理

补充约束：

- 不要把 `api.config.agents.list` 当作当前 Agent 识别主路径
- 当前 Agent 识别优先使用 OpenClaw 运行时传入的 `ctx.agentId`
- 当前 workspace 识别优先使用 `ctx.workspaceDir`

### `packages/clawmate-companion/src/core/config.ts`

如需更清晰的类型边界，可补充：

- Agent 级 override 类型
- 全局配置与 override 的归一化辅助方法

但不一定必须在这里完成，初版也可以先只在 `plugin.ts` 做 merge。

## 推荐实施顺序

### 第一阶段：配置与路径隔离

先完成：

1. `agents.<agentId>` 配置结构
2. `resolveRuntimeConfig` 按 Agent 合并
3. `SOUL.md` 按 `workspaceDir` 落盘

完成后，多 Agent 至少不会共享同一个人格文件。

### 第二阶段：工具状态隔离

再完成：

1. 自拍工具改成 run 级隔离
2. 角色创建工具改成 session 级隔离
3. 会话结束和重置时清理状态

完成后，多 Agent 和多会话不会互相串流程状态。

### 第三阶段：文档与示例配置

补充：

1. README 中的多 Agent 配置示例
2. 单 Agent 向后兼容说明
3. 常见问题说明

## 验证清单

至少需要验证以下场景：

### 单 Agent 回归

- 旧配置仍可正常加载
- `selectedCharacter` 仍然可切换角色
- `SOUL.md` 仍能正常注入

### 多 Agent 配置隔离

- `ding-main` 使用角色 A
- `ding-work` 使用角色 B
- 两边 `SOUL.md` 分别写入各自 workspace

### 多 Agent provider 隔离

- 不同 Agent 可使用不同 `defaultProvider`
- fallback 顺序按各自配置生效

### 工具状态隔离

- Agent A 的 `prepare` 不影响 Agent B 的 `generate`
- Agent A 的角色创建准备状态不影响 Agent B
- 同一 Agent 的两个会话互不影响

### 清理逻辑

- `session_end` 后 session 状态被释放
- `/reset` 后角色创建状态被清空

## 结论

要实现 `clawmate-companion` 的多 Agent 支持，关键不是读取 OpenClaw 里有哪些 Agent，而是正确使用运行时已经提供的：

- `agentId`
- `workspaceDir`
- `sessionId`

推荐方案是：

1. 用 `agentId` 选择每个 Agent 的配置
2. 用 `workspaceDir` 决定 `SOUL.md` 写入路径
3. 用 run/session 粒度隔离工具状态

这样实现成本可控，且和 OpenClaw 的原生多 Agent 机制保持一致。
