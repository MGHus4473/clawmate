# 设计：clawmate-companion 多 Agent 支持

## 背景

设计背景和源码验证结论已整理在 [doc/multi-agent-design.md](../../../doc/multi-agent-design.md)。本设计文档只保留提案落地所需的关键实现决策。

## 设计决策

### 1. 运行时上下文是真相来源

插件必须优先使用 OpenClaw 传入的运行时上下文：

- `ctx.agentId` 用于选择当前 Agent 配置
- `ctx.workspaceDir` 用于确定 `SOUL.md` 路径
- `ctx.sessionId` 用于隔离跨轮工具状态

`api.config.agents.list` 只可作为回退或诊断用途，不作为主流程。

### 2. Agent 级配置覆写由插件自行定义

由于 OpenClaw 只向插件暴露一份全局 `pluginConfig`，插件必须自行定义 Agent 级覆写结构：

```json
{
  "selectedCharacter": "brooke-anime",
  "defaultProvider": "volcengine",
  "agents": {
    "ding-main": {
      "selectedCharacter": "brooke-anime"
    },
    "ding-work": {
      "selectedCharacter": "brooke",
      "defaultProvider": "aliyun"
    }
  }
}
```

运行时合并顺序：

1. 插件默认值
2. 顶层全局配置
3. `agents[agentId]`

字段策略：

- 标量字段直接覆盖
- `fallback` / `retry` / `proactiveSelfie` 做对象级合并
- `providers` 做对象合并，允许局部覆写单个 provider 配置

### 3. SOUL 注入跟随 workspaceDir

当前 `SOUL.md` 写入固定路径，必须改为：

1. 优先写入 `path.join(ctx.workspaceDir, "SOUL.md")`
2. 如果 `ctx.workspaceDir` 缺失，则回退到旧路径，确保兼容单 Agent 旧逻辑

### 4. 工具状态隔离使用两种生命周期

`prepareCalled` 和 `characterPrepareCalled` 生命周期不同，不能共用同一种状态模型。

#### `prepareCalled`

- 粒度：run 级
- 实现：tool factory 闭包内局部变量
- 原因：自拍准备和生成通常在同一次 agent run 内完成，不需要跨轮保存

#### `characterPrepareCalled`

- 粒度：session 级
- 实现：`Map<string, SessionState>`
- key：`agentId:sessionId`
- 原因：角色创建流程可能跨多轮确认，需要跨 run 持续存在，但不能跨 session 共享

### 5. 会话状态清理是显式的

会话级状态在以下时机清理：

- `session_end`
- `before_reset`

这两类 hook 都具备清理所需的 `agentId` 和 `sessionId` 上下文。

## 实现计划

### 插件 schema

在 `packages/clawmate-companion/openclaw.plugin.json` 中增加：

- `agents.<agentId>.selectedCharacter`
- `agents.<agentId>.defaultProvider`
- `agents.<agentId>.fallback`
- `agents.<agentId>.retry`
- `agents.<agentId>.proactiveSelfie`
- `agents.<agentId>.characterRoot`
- `agents.<agentId>.userCharacterRoot`
- `agents.<agentId>.providers`

### 运行时配置解析

在 `packages/clawmate-companion/src/plugin.ts` 中新增按上下文解析配置的入口，例如：

```ts
resolveRuntimeConfig(api, {
  agentId: ctx.agentId,
  workspaceDir: ctx.workspaceDir,
});
```

### Hook 更新

`before_agent_start` 改为：

- 使用 `ctx.agentId` 选择角色配置
- 使用 `ctx.workspaceDir` 生成 `SOUL.md`

### 工具注册更新

将工具改为 factory 注册：

```ts
api.registerTool((ctx) => {
  let prepareCalled = false;
  const state = getSessionState(ctx);
  return [...tools];
});
```

### 清理 Hook

新增或扩展：

- `api.on("session_end", ...)`
- `api.on("before_reset", ...)`

用于删除 `agentId:sessionId` 对应的会话状态。

## 风险

### 合并语义漂移

如果全局配置和 Agent 覆写的合并规则定义不清，可能导致 provider 或 fallback 行为和用户预期不一致。

### 会话清理缺口

如果没有覆盖 `session_end` 和 `/reset` 两类退出路径，会导致角色创建状态残留。

### 兼容性回归

如果 `workspaceDir` 缺失时不做回退，可能影响旧的单 Agent 安装。

## 验证

至少验证以下场景：

1. 旧配置在单 Agent 下保持行为不变。
2. 两个 Agent 使用不同角色时，分别写入各自 workspace 的 `SOUL.md`。
3. 两个 Agent 使用不同 provider 时，互不影响。
4. 一个 Agent 的自拍准备状态不会影响另一个 Agent。
5. 同一 Agent 的两个 session 不共享角色创建准备状态。
6. `session_end` 和 `/reset` 后会话状态被清理。

