import test from "node:test";
import assert from "node:assert/strict";
import { createOpenAICompatibleProvider } from "./openai-compatible";
import type { GenerateRequest } from "../types";

const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+X2NDNwAAAABJRU5ErkJggg==";
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

function makePayload(referenceImages: string[] = [PNG_DATA_URL]): GenerateRequest {
  return {
    characterId: "brooke",
    prompt: "draw a portrait",
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

function jsonResponse(body: unknown, requestId: string, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "x-request-id": requestId,
    },
  });
}

function toUrl(input: string | URL | Request): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

test("openai-compatible prefers /images/edits when a reference image is available", async () => {
  const calls: string[] = [];
  const provider = createOpenAICompatibleProvider(
    {
      name: "openai",
      apiKey: "sk-test",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-image-1.5",
    },
    async (input) => {
      const url = toUrl(input);
      if (url === "data:,") {
        return globalThis.fetch(url);
      }
      calls.push(url);
      if (url.endsWith("/images/edits")) {
        return jsonResponse({ data: [{ url: "https://example.com/edited.png" }] }, "edit-req");
      }
      throw new Error(`unexpected url: ${url}`);
    },
  );

  const result = await provider.generate(makePayload());

  assert.equal(result.requestId, "edit-req");
  assert.equal(result.imageUrl, "https://example.com/edited.png");
  assert.deepEqual(calls, ["https://api.openai.com/v1/images/edits"]);
});

test("openai-compatible falls back to /chat/completions when /images/edits fails", async () => {
  const calls: string[] = [];
  const provider = createOpenAICompatibleProvider(
    {
      name: "openai",
      apiKey: "sk-test",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-image-1.5",
    },
    async (input) => {
      const url = toUrl(input);
      if (url === "data:,") {
        return globalThis.fetch(url);
      }
      calls.push(url);
      if (url.endsWith("/images/edits")) {
        return jsonResponse({ error: { message: "unsupported" } }, "edit-fail", 400);
      }
      if (url.endsWith("/chat/completions")) {
        return jsonResponse(
          {
            choices: [
              {
                message: {
                  content: "https://example.com/fallback.png",
                },
              },
            ],
          },
          "chat-req",
        );
      }
      throw new Error(`unexpected url: ${url}`);
    },
  );

  const result = await provider.generate(makePayload());

  assert.equal(result.requestId, "chat-req");
  assert.equal(result.imageUrl, "https://example.com/fallback.png");
  assert.deepEqual(calls, ["https://api.openai.com/v1/images/edits", "https://api.openai.com/v1/chat/completions"]);
});

test("openai-compatible skips /images/edits when no reference image is available", async () => {
  const calls: string[] = [];
  const provider = createOpenAICompatibleProvider(
    {
      name: "openai",
      apiKey: "sk-test",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-image-1.5",
    },
    async (input) => {
      const url = toUrl(input);
      if (url === "data:,") {
        return globalThis.fetch(url);
      }
      calls.push(url);
      if (url.endsWith("/chat/completions")) {
        return jsonResponse(
          {
            choices: [
              {
                message: {
                  content: "https://example.com/text-only.png",
                },
              },
            ],
          },
          "chat-only-req",
        );
      }
      throw new Error(`unexpected url: ${url}`);
    },
  );

  const result = await provider.generate(makePayload([]));

  assert.equal(result.requestId, "chat-only-req");
  assert.equal(result.imageUrl, "https://example.com/text-only.png");
  assert.deepEqual(calls, ["https://api.openai.com/v1/chat/completions"]);
});
