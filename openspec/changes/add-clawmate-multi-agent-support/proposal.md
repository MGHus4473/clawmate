# Proposal: Add multi-agent support to clawmate-companion

## Summary

为 `clawmate-companion` 增加真正的多 Agent 支持，使不同 OpenClaw Agent 可以使用不同角色、不同 provider 配置、不同 `workspace/SOUL.md`，并避免工具流程状态在 Agent 或会话之间串扰。

## Problem

当前插件只有一份全局配置和一份全局运行时状态：

- 所有 Agent 共用同一个 `selectedCharacter`
- 所有 Agent 共用同一个 `defaultProvider`
- `SOUL.md` 固定写入单一全局 workspace
- `prepareCalled` / `characterPrepareCalled` 是插件级全局变量

OpenClaw 已经支持多 Agent、每个 Agent 独立 `binding` 与 `workspace`。插件现状会导致不同 Agent 之间的人设、工作空间和工具状态互相覆盖。

## Proposed Change

本提案引入以下能力：

1. 支持 `plugins.entries.clawmate-companion.config.agents.<agentId>` 形式的 Agent 级配置覆写。
2. 使用 OpenClaw 运行时上下文中的 `agentId` 选择配置。
3. 使用 OpenClaw 运行时上下文中的 `workspaceDir` 作为 `SOUL.md` 的写入位置。
4. 将自拍准备状态隔离到单次 run。
5. 将角色创建准备状态隔离到单个 `agentId:sessionId`。
6. 在 `session_end` 和 `before_reset` 清理会话级状态。
7. 保持旧的单 Agent 配置继续可用。

## Why This Approach

OpenClaw 源码已经明确提供多 Agent 所需的运行时信息：

- tool context 提供 `agentId`、`workspaceDir`、`sessionId`
- hook context 提供 `agentId`、`workspaceDir`、`sessionId`
- `registerTool` 支持 tool factory
- `session_end` 与 `before_reset` 可用于会话级清理
- `pluginConfig` 仍然只有插件级一份，宿主不会自动生成 per-agent pluginConfig

因此，正确实现路径是“使用宿主已解析好的 Agent 上下文”，而不是在插件内部重复解析 `bindings` 或把 `workspace` 当主键。

## Non-goals

- 在插件内部重做 OpenClaw `bindings` 或账号路由
- 把 `workspace` 设计成主配置键
- 修改 OpenClaw 宿主源码
- 改变单 Agent 用户已有配置的行为语义

## Impact

实现后，用户可以在一个 OpenClaw 实例中让多个 Agent 复用同一个插件，但保持各自独立的角色、配置和状态，适用于多机器人账号、多场景角色和多工作空间部署。

