# clawmate-companion multi-agent

## ADDED Requirements

### Requirement: The plugin must support agent-scoped config overrides

`clawmate-companion` MUST support Agent-scoped plugin configuration under `plugins.entries.clawmate-companion.config.agents.<agentId>`.

#### Scenario: agent override replaces global character selection

- **Given** the global config sets `selectedCharacter` to `brooke-anime`
- **And** `agents.ding-work.selectedCharacter` is `brooke`
- **When** runtime config is resolved for agent `ding-work`
- **Then** the effective `selectedCharacter` must be `brooke`
- **And** unspecified fields must continue to inherit from the global config

#### Scenario: agent override replaces global provider selection

- **Given** the global config sets `defaultProvider` to `volcengine`
- **And** `agents.ding-work.defaultProvider` is `aliyun`
- **When** runtime config is resolved for agent `ding-work`
- **Then** the effective `defaultProvider` must be `aliyun`

#### Scenario: single-agent config remains valid

- **Given** the plugin config does not define `agents`
- **When** runtime config is resolved
- **Then** the plugin must continue to use the top-level config without requiring migration

### Requirement: SOUL injection must use the current agent workspace

The plugin MUST write Agent prompt injection output to the current Agent workspace instead of a single shared workspace.

#### Scenario: SOUL.md is written to the active workspace

- **Given** OpenClaw invokes the plugin for agent `ding-main`
- **And** the runtime hook context contains `workspaceDir = C:\Users\Administrator\.openclaw\workspace-ding-main`
- **When** the plugin prepares role prompt injection
- **Then** it must write `SOUL.md` to `C:\Users\Administrator\.openclaw\workspace-ding-main\SOUL.md`

#### Scenario: legacy fallback remains available

- **Given** the runtime hook context does not provide `workspaceDir`
- **When** the plugin prepares role prompt injection
- **Then** it must fall back to the legacy default workspace path

### Requirement: Selfie workflow state must be isolated per run

The prepare state used by `clawmate_prepare_selfie` and `clawmate_generate_selfie` MUST NOT be shared across Agent runs.

#### Scenario: one agent run cannot unlock selfie generation for another

- **Given** run A has already called `clawmate_prepare_selfie`
- **And** run B is a different Agent invocation
- **When** run B calls `clawmate_generate_selfie` without calling `clawmate_prepare_selfie`
- **Then** the plugin must reject the request as not prepared

### Requirement: Character creation workflow state must be isolated per agent session

The prepare state used by `clawmate_prepare_character` and `clawmate_create_character` MUST be isolated by Agent session and cleaned when the session ends or resets.

#### Scenario: one session cannot unlock character creation for another

- **Given** session A for agent `ding-main` has called `clawmate_prepare_character`
- **And** session B for agent `ding-main` has not called `clawmate_prepare_character`
- **When** session B calls `clawmate_create_character`
- **Then** the plugin must reject the request as not prepared

#### Scenario: state is cleared after reset

- **Given** a session has called `clawmate_prepare_character`
- **When** that session is reset
- **Then** a later call to `clawmate_create_character` in the new session must require preparation again

#### Scenario: state is cleared when the session ends

- **Given** a session has called `clawmate_prepare_character`
- **When** the session ends
- **Then** any future session for the same agent must start without a prepared character state

