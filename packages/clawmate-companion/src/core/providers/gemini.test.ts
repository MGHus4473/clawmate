import test from "node:test";
import assert from "node:assert/strict";
import { createGeminiProvider } from "./gemini";
import type { GenerateRequest } from "../types";

const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+X2NDNwAAAABJRU5ErkJggg==";
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

function makePayload(referenceImages: string[] = [PNG_DATA_URL], prompt = "draw a portrait"): GenerateRequest {
  return {
    characterId: "brooke",
    prompt,
    mode: "mirror",
    referencePath: referenceImages.length > 0 ? "C:\\reference.png" : "",
    referencePaths: referenceImages.length > 0 ? ["C:\\reference.png"] : [],
    referenceImageBase64: referenceImages.length > 0 ? PNG_BASE64 : "",
    referenceImageBase64List: referenceImages.length > 0 ? [PNG_BASE64] : [],
    referenceImageDataUrl: referenceImages[0] ?? "",
    referenceImageDataUrls: referenceImages,
    timeState: "night",
    meta: {
      state: "night",
      roleName: "Brooke",
      eventSource: "test",
    },
  };
}

test("gemini uses the SDK default endpoint when baseUrl is not configured", async () => {
  let capturedConfig: Record<string, unknown> | null = null;
  let capturedRequest: Record<string, unknown> | null = null;

  const provider = createGeminiProvider(
    {
      name: "gemini",
      apiKey: "test-key",
      model: "gemini-3.1-flash-image-preview",
    },
    (config) => {
      capturedConfig = config as unknown as Record<string, unknown>;
      return {
        models: {
          generateContent: async (request) => {
            capturedRequest = request as unknown as Record<string, unknown>;
            return {
              responseId: "gemini-default-req",
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        inlineData: {
                          mimeType: "image/png",
                          data: PNG_BASE64,
                        },
                      },
                    ],
                  },
                },
              ],
            };
          },
        },
      };
    },
  );

  const result = await provider.generate(makePayload([]));

  assert.equal(capturedConfig?.baseUrl, null);
  assert.equal(capturedConfig?.model, "gemini-3.1-flash-image-preview");
  assert.deepEqual(capturedRequest?.config, {
    responseModalities: ["IMAGE"],
  });
  assert.deepEqual(capturedRequest?.contents, [
    {
      role: "user",
      parts: [{ text: "draw a portrait" }],
    },
  ]);
  assert.equal(result.requestId, "gemini-default-req");
  assert.equal(result.imageUrl, PNG_DATA_URL);
});

test("gemini forwards a configured custom BaseURL", async () => {
  let capturedConfig: Record<string, unknown> | null = null;

  const provider = createGeminiProvider(
    {
      name: "gemini",
      apiKey: "test-key",
      model: "custom-gemini-image-model",
      baseUrl: "https://proxy.example.com/",
    },
    (config) => {
      capturedConfig = config as unknown as Record<string, unknown>;
      return {
        models: {
          generateContent: async () => ({
            responseId: "gemini-custom-req",
            candidates: [
              {
                content: {
                  parts: [
                    {
                      inlineData: {
                        mimeType: "image/png",
                        data: PNG_BASE64,
                      },
                    },
                  ],
                },
              },
            ],
          }),
        },
      };
    },
  );

  const result = await provider.generate(makePayload([]));

  assert.equal(capturedConfig?.baseUrl, "https://proxy.example.com");
  assert.equal(capturedConfig?.model, "custom-gemini-image-model");
  assert.equal(result.requestId, "gemini-custom-req");
  assert.equal(result.imageUrl, PNG_DATA_URL);
});

test("gemini includes reference images as inline image parts", async () => {
  let capturedRequest: Record<string, unknown> | null = null;

  const provider = createGeminiProvider(
    {
      name: "gemini",
      apiKey: "test-key",
      model: "gemini-2.5-flash-image",
    },
    () => ({
      models: {
        generateContent: async (request) => {
          capturedRequest = request as unknown as Record<string, unknown>;
          return {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      inlineData: {
                        mimeType: "image/png",
                        data: PNG_BASE64,
                      },
                    },
                  ],
                },
              },
            ],
          };
        },
      },
    }),
  );

  await provider.generate(makePayload([PNG_DATA_URL, PNG_DATA_URL]));

  assert.deepEqual(capturedRequest?.contents, [
    {
      role: "user",
      parts: [
        {
          inlineData: {
            mimeType: "image/png",
            data: PNG_BASE64,
          },
        },
        {
          text: "draw a portrait",
        },
      ],
    },
  ]);
});

test("gemini keeps custom model strings unchanged", async () => {
  let capturedRequest: Record<string, unknown> | null = null;

  const provider = createGeminiProvider(
    {
      name: "gemini",
      apiKey: "test-key",
      model: "my-company/gemini-image-proxy",
    },
    () => ({
      models: {
        generateContent: async (request) => {
          capturedRequest = request as unknown as Record<string, unknown>;
          return {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      inlineData: {
                        mimeType: "image/png",
                        data: PNG_BASE64,
                      },
                    },
                  ],
                },
              },
            ],
          };
        },
      },
    }),
  );

  await provider.generate(makePayload([]));

  assert.equal(capturedRequest?.model, "my-company/gemini-image-proxy");
});

test("gemini fails when the response contains no image payload", async () => {
  const provider = createGeminiProvider(
    {
      name: "gemini",
      apiKey: "test-key",
      model: "gemini-3-pro-image-preview",
    },
    () => ({
      models: {
        generateContent: async () => ({
          responseId: "gemini-no-image",
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: "safety filtered",
                  },
                ],
              },
            },
          ],
        }),
      },
    }),
  );

  await assert.rejects(
    () => provider.generate(makePayload([])),
    (error: unknown) => {
      assert.equal(typeof error, "object");
      const resolved = error as { code?: string; requestId?: string | null; details?: Record<string, unknown> };
      assert.equal(resolved.code, "PROVIDER_IMAGE_URL_MISSING");
      assert.equal(resolved.requestId, "gemini-no-image");
      assert.deepEqual(resolved.details, {
        textPreview: ["safety filtered"],
      });
      return true;
    },
  );
});
