## ADDED Requirements

### Requirement: Gemini provider configuration supports official default and custom endpoints
The system SHALL support a provider configuration with `type: "gemini"`, a non-empty `apiKey`, a non-empty `model`, and an optional `baseUrl`. The provider MUST use the Google GenAI SDK default Gemini API endpoint when `baseUrl` is absent or empty, and MUST route requests through the configured `baseUrl` when it is present. The provider MUST accept both the built-in preset model names and any user-supplied non-empty custom model string.

#### Scenario: Official default endpoint is used
- **WHEN** a Gemini provider is configured with `type: "gemini"`, `apiKey`, and `model`, but without `baseUrl`
- **THEN** the provider uses the Google GenAI SDK default endpoint configuration

#### Scenario: Custom BaseURL is used
- **WHEN** a Gemini provider is configured with a non-empty `baseUrl`
- **THEN** the provider sends Gemini SDK requests through that `baseUrl`

#### Scenario: Custom model string is preserved
- **WHEN** a Gemini provider is configured with a non-empty custom model string that is not one of the built-in presets
- **THEN** the provider uses that exact model value for Gemini image requests

### Requirement: Gemini provider maps selfie requests to Gemini image generation semantics
The system SHALL use the Google GenAI SDK image generation request path for Gemini image models. When ClawMate provides one or more reference images, the provider MUST include those images as inline image parts together with the text prompt in the same request. When no reference image is available, the provider MUST send a prompt-only image generation request. The provider MUST request image output rather than a text-only response.

#### Scenario: Text-to-image request without reference images
- **WHEN** the selfie pipeline calls the Gemini provider with a prompt and no reference images
- **THEN** the provider sends a Gemini image generation request containing the prompt and requesting image output

#### Scenario: Image editing request with reference images
- **WHEN** the selfie pipeline calls the Gemini provider with one or more reference images and a prompt
- **THEN** the provider includes the reference images as inline image parts in the Gemini request together with the prompt

### Requirement: Gemini provider returns a persistable image result
The system SHALL extract the first image payload returned by Gemini and convert it into a `data:image/...;base64,...` URL for downstream persistence. If Gemini returns no image payload, the provider MUST fail with a structured provider error instead of returning a successful result.

#### Scenario: Gemini returns an image payload
- **WHEN** Gemini returns a response containing one or more image parts
- **THEN** the provider returns the first image part as a data URL in `imageUrl`

#### Scenario: Gemini returns no image payload
- **WHEN** Gemini returns only text or metadata without any image part
- **THEN** the provider returns a provider failure that reports the missing image response
