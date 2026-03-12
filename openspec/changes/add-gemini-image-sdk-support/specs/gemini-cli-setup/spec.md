## ADDED Requirements

### Requirement: CLI setup offers Gemini as an image service option
The setup wizard SHALL list Gemini as an available image service during provider selection. When the user creates a new Gemini service through the wizard, the written provider configuration MUST use `type: "gemini"`, and the selected scope's `defaultProvider` MUST point to that Gemini provider entry.

#### Scenario: Gemini appears in the provider list
- **WHEN** the user opens the image service selection step in `clawmate:setup`
- **THEN** Gemini appears as a selectable provider option

#### Scenario: Selecting Gemini makes it the active provider
- **WHEN** the user completes setup with a newly created Gemini service
- **THEN** the resulting config stores a Gemini provider entry and sets the current scope's `defaultProvider` to that provider key

### Requirement: CLI setup provides Gemini preset models and custom model input
The setup wizard SHALL present the following Gemini model presets:

- `gemini-3-pro-image-preview`
- `gemini-3.1-flash-image-preview`
- `gemini-2.5-flash-image`
- `gemini-2.5-flash-image-preview`

The setup wizard MUST also allow the user to enter a custom model string. The written provider configuration MUST persist the exact selected or custom model value.

#### Scenario: User selects a preset Gemini model
- **WHEN** the user chooses `gemini-3.1-flash-image-preview` from the Gemini model list
- **THEN** the written Gemini provider configuration stores `model: "gemini-3.1-flash-image-preview"`

#### Scenario: User enters a custom Gemini model
- **WHEN** the user chooses custom input and enters a non-empty Gemini model string
- **THEN** the written Gemini provider configuration stores that exact model string

### Requirement: CLI setup supports official default endpoint and custom BaseURL modes for Gemini
The setup wizard SHALL prompt Gemini users to choose between the official default Gemini API address and a custom BaseURL. When the official default mode is chosen, the written Gemini provider configuration MUST omit `baseUrl`. When the custom BaseURL mode is chosen, the wizard MUST require a non-empty BaseURL and MUST persist it in the Gemini provider configuration.

#### Scenario: User chooses the official default Gemini endpoint
- **WHEN** the user selects the official default endpoint mode for Gemini
- **THEN** the written Gemini provider configuration contains `type`, `apiKey`, and `model` without a `baseUrl` field

#### Scenario: User chooses a custom Gemini BaseURL
- **WHEN** the user selects custom BaseURL mode and enters a non-empty URL
- **THEN** the written Gemini provider configuration contains that exact `baseUrl` value
