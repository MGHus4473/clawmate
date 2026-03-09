# Tasks

## 1. Schema and config resolution

- [x] 1.1 Extend `packages/clawmate-companion/openclaw.plugin.json` to accept `config.agents.<agentId>` overrides
- [x] 1.2 Define merge semantics for scalar fields, nested objects, and `providers`
- [x] 1.3 Implement runtime config resolution by `ctx.agentId` with backward compatibility for single-agent configs

## 2. Workspace-scoped prompt injection

- [x] 2.1 Update `before_agent_start` to read `ctx.agentId` and `ctx.workspaceDir`
- [x] 2.2 Change `SOUL.md` path resolution to prefer the current agent workspace
- [x] 2.3 Keep the legacy global workspace path as a fallback when runtime workspace is unavailable

## 3. Tool lifecycle isolation

- [x] 3.1 Convert plugin tools to tool factory registration
- [x] 3.2 Move selfie prepare state to run-scoped closure state
- [x] 3.3 Move character prepare state to session-scoped state keyed by `agentId:sessionId`
- [x] 3.4 Clear session-scoped state on `session_end`
- [x] 3.5 Clear session-scoped state on `before_reset`

## 4. Documentation and verification

- [x] 4.1 Add multi-agent config examples to repository docs
- [x] 4.2 Add or update tests that cover single-agent compatibility and multi-agent isolation
- [x] 4.3 Verify different agents can use different characters and providers without state leakage
