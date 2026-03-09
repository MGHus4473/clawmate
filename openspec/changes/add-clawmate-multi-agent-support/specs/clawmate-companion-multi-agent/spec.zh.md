# 规范：clawmate-companion 多 Agent 支持

## 新增需求

### 需求：插件必须支持 Agent 级配置覆写

`clawmate-companion` 必须支持在 `plugins.entries.clawmate-companion.config.agents.<agentId>` 下配置 Agent 级的插件配置覆写。

#### 场景：Agent 覆写替换全局角色选择

- **假设** 全局配置设置 `selectedCharacter` 为 `brooke-anime`
- **并且** `agents.ding-work.selectedCharacter` 为 `brooke`
- **当** 为 agent `ding-work` 解析运行时配置时
- **那么** 有效的 `selectedCharacter` 必须为 `brooke`
- **并且** 未指定的字段必须继续从全局配置继承

#### 场景：Agent 覆写替换全局 provider 选择

- **假设** 全局配置设置 `defaultProvider` 为 `volcengine`
- **并且** `agents.ding-work.defaultProvider` 为 `aliyun`
- **当** 为 agent `ding-work` 解析运行时配置时
- **那么** 有效的 `defaultProvider` 必须为 `aliyun`

#### 场景：单 Agent 配置保持有效

- **假设** 插件配置未定义 `agents`
- **当** 解析运行时配置时
- **那么** 插件必须继续使用顶层配置，无需迁移

### 需求：SOUL 注入必须使用当前 Agent workspace

插件必须将 Agent 人设提示注入输出写入当前 Agent workspace，而非单一共享 workspace。

#### 场景：SOUL.md 写入活动 workspace

- **假设** OpenClaw 为 agent `ding-main` 调用插件
- **并且** 运行时 hook 上下文包含 `workspaceDir = C:\Users\Administrator\.openclaw\workspace-ding-main`
- **当** 插件准备人设提示注入时
- **那么** 必须将 `SOUL.md` 写入 `C:\Users\Administrator\.openclaw\workspace-ding-main\SOUL.md`

#### 场景：旧版回退仍然可用

- **假设** 运行时 hook 上下文未提供 `workspaceDir`
- **当** 插件准备人设提示注入时
- **那么** 必须回退到旧版默认 workspace 路径

### 需求：自拍工作流状态必须按运行隔离

`clawmate_prepare_selfie` 和 `clawmate_generate_selfie` 使用的准备状态不能在 Agent 运行之间共享。

#### 场景：一个 Agent 运行无法为另一个解锁自拍生成

- **假设** 运行 A 已调用 `clawmate_prepare_selfie`
- **并且** 运行 B 是不同的 Agent 调用
- **当** 运行 B 调用 `clawmate_generate_selfie` 而未调用 `clawmate_prepare_selfie` 时
- **那么** 插件必须拒绝该请求，提示未准备

### 需求：角色创建工作流状态必须按 Agent 会话隔离

`clawmate_prepare_character` 和 `clawmate_create_character` 使用的准备状态必须按 Agent 会话隔离，并在会话结束或重置时清理。

#### 场景：一个会话无法为另一个解锁角色创建

- **假设** agent `ding-main` 的会话 A 已调用 `clawmate_prepare_character`
- **并且** agent `ding-main` 的会话 B 未调用 `clawmate_prepare_character`
- **当** 会话 B 调用 `clawmate_create_character` 时
- **那么** 插件必须拒绝该请求，提示未准备

#### 场景：重置后状态被清理

- **假设** 一个会话已调用 `clawmate_prepare_character`
- **当** 该会话被重置时
- **那么** 新会话中后续调用 `clawmate_create_character` 必须重新进行准备

#### 场景：会话结束时状态被清理

- **假设** 一个会话已调用 `clawmate_prepare_character`
- **当** 会话结束时
- **那么** 同一 agent 的任何未来会话必须从无准备状态开始

