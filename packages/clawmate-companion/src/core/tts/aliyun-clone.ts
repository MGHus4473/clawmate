import { ClawMateError } from "../errors";

export interface CreateAliyunCloneVoiceModelOptions {
  apiKey: string;
  baseUrl: string;
  targetModel: string;
  speaker?: string;
  promptAudioUrl: string;
  promptText: string;
  fetchImpl?: typeof fetch;
}

export interface CreateAliyunCloneVoiceModelResult {
  requestId: string | null;
  modelId: string | null;
  taskId: string | null;
  status: string | null;
  raw: unknown;
}

export interface PollAliyunCloneVoiceModelOptions {
  apiKey: string;
  statusUrl: string;
  taskId: string;
  pollIntervalMs?: number;
  maxAttempts?: number;
  fetchImpl?: typeof fetch;
}

export interface GenerateAliyunCloneTtsOptions {
  text: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  modelId: string;
  speaker?: string;
  fetchImpl?: typeof fetch;
}

export interface GenerateAliyunCloneTtsResult {
  audioUrl: string;
  requestId: string | null;
  model: string;
  voice: string;
}

interface CloneApiBody {
  output?: {
    audio?: {
      url?: unknown;
    };
    model_id?: unknown;
    task_id?: unknown;
    status?: unknown;
  };
  data?: {
    id?: unknown;
    task_id?: unknown;
    status?: unknown;
    model_id?: unknown;
  };
  code?: unknown;
  message?: unknown;
}

function toOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function buildGenerationUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/services/aigc/multimodal-generation/generation`;
}

function buildCloneModelCreateUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/services/voice/audio/voice-cloning`; 
}

function buildCloneTaskStatusUrl(statusUrl: string, taskId: string): string {
  return `${normalizeBaseUrl(statusUrl)}/services/voice/audio/voice-cloning/${encodeURIComponent(taskId)}`;
}

async function parseJsonBody(response: Response): Promise<{ requestId: string | null; body: CloneApiBody | null; rawText: string }> {
  const requestId =
    response.headers.get("x-dashscope-request-id") ??
    response.headers.get("x-request-id") ??
    null;

  let rawText = "";
  let body: CloneApiBody | null = null;
  try {
    rawText = await response.text();
    body = rawText ? (JSON.parse(rawText) as CloneApiBody) : null;
  } catch (error) {
    throw new ClawMateError("TTS provider 响应解析失败", {
      code: "TTS_RESPONSE_PARSE_ERROR",
      transient: true,
      requestId,
      details: {
        cause: error instanceof Error ? error.message : String(error),
        responseText: rawText,
      },
    });
  }

  if (!response.ok) {
    throw new ClawMateError(toOptionalString(body?.message) ?? `TTS provider 请求失败: HTTP ${response.status}`, {
      code: toOptionalString(body?.code) ?? "TTS_PROVIDER_HTTP_ERROR",
      transient: response.status >= 500,
      requestId,
      details: body,
    });
  }

  return { requestId, body, rawText };
}

export async function createAliyunCloneVoiceModel(
  options: CreateAliyunCloneVoiceModelOptions,
): Promise<CreateAliyunCloneVoiceModelResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(buildCloneModelCreateUrl(options.baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.targetModel,
      input: {
        voice_name: options.speaker?.trim() || undefined,
        prompt_audio_url: options.promptAudioUrl,
        prompt_text: options.promptText,
      },
    }),
  });

  const { requestId, body } = await parseJsonBody(response);
  return {
    requestId,
    modelId: toOptionalString(body?.output?.model_id) ?? toOptionalString(body?.data?.model_id),
    taskId: toOptionalString(body?.output?.task_id) ?? toOptionalString(body?.data?.task_id),
    status: toOptionalString(body?.output?.status) ?? toOptionalString(body?.data?.status),
    raw: body,
  };
}

export async function pollAliyunCloneVoiceModel(
  options: PollAliyunCloneVoiceModelOptions,
): Promise<CreateAliyunCloneVoiceModelResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxAttempts = options.maxAttempts ?? 60;
  const pollIntervalMs = options.pollIntervalMs ?? 3000;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetchImpl(buildCloneTaskStatusUrl(options.statusUrl, options.taskId), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
      },
    });

    const { requestId, body } = await parseJsonBody(response);
    const status = toOptionalString(body?.output?.status) ?? toOptionalString(body?.data?.status);
    const modelId = toOptionalString(body?.output?.model_id) ?? toOptionalString(body?.data?.model_id);

    if (status === "SUCCEEDED" || status === "SUCCESS" || modelId) {
      return {
        requestId,
        modelId,
        taskId: options.taskId,
        status,
        raw: body,
      };
    }

    if (status === "FAILED") {
      throw new ClawMateError("复刻语音模型创建失败", {
        code: "TTS_CLONE_MODEL_CREATE_FAILED",
        requestId,
        details: body,
      });
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new ClawMateError("等待复刻语音模型完成超时", {
    code: "TTS_CLONE_MODEL_TIMEOUT",
    transient: true,
    details: {
      taskId: options.taskId,
      maxAttempts,
      pollIntervalMs,
    },
  });
}

export async function generateAliyunCloneTts(
  options: GenerateAliyunCloneTtsOptions,
): Promise<GenerateAliyunCloneTtsResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(buildGenerationUrl(options.baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model,
      input: {
        text: options.text,
        model_id: options.modelId,
        voice: options.speaker?.trim() || undefined,
      },
    }),
  });

  const { requestId, body } = await parseJsonBody(response);
  const audioUrl = toOptionalString(body?.output?.audio?.url);
  if (!audioUrl) {
    throw new ClawMateError("TTS provider 响应中缺少 audio url", {
      code: "TTS_AUDIO_URL_MISSING",
      requestId,
      details: body,
    });
  }

  return {
    audioUrl,
    requestId,
    model: options.model,
    voice: options.speaker?.trim() || options.modelId,
  };
}
