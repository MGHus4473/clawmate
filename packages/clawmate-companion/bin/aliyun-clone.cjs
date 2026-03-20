const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/api/v1";

function toOptionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function buildCloneModelCreateUrl(baseUrl) {
  return `${normalizeBaseUrl(baseUrl)}/services/voice/audio/voice-cloning`;
}

function buildCloneTaskStatusUrl(statusUrl, taskId) {
  return `${normalizeBaseUrl(statusUrl)}/services/voice/audio/voice-cloning/${encodeURIComponent(taskId)}`;
}

async function parseJsonBody(response) {
  const requestId =
    response.headers.get("x-dashscope-request-id") ??
    response.headers.get("x-request-id") ??
    null;

  let rawText = "";
  let body = null;
  try {
    rawText = await response.text();
    body = rawText ? JSON.parse(rawText) : null;
  } catch (error) {
    const err = new Error("TTS provider 响应解析失败");
    err.code = "TTS_RESPONSE_PARSE_ERROR";
    err.requestId = requestId;
    err.details = {
      cause: error instanceof Error ? error.message : String(error),
      responseText: rawText,
    };
    throw err;
  }

  if (!response.ok) {
    const err = new Error(toOptionalString(body?.message) ?? `TTS provider 请求失败: HTTP ${response.status}`);
    err.code = toOptionalString(body?.code) ?? "TTS_PROVIDER_HTTP_ERROR";
    err.requestId = requestId;
    err.details = body;
    throw err;
  }

  return { requestId, body, rawText };
}

async function createAliyunCloneVoiceModel(options) {
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

async function pollAliyunCloneVoiceModel(options) {
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
      const err = new Error("复刻语音模型创建失败");
      err.code = "TTS_CLONE_MODEL_CREATE_FAILED";
      err.requestId = requestId;
      err.details = body;
      throw err;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  const err = new Error("等待复刻语音模型完成超时");
  err.code = "TTS_CLONE_MODEL_TIMEOUT";
  err.details = {
    taskId: options.taskId,
    maxAttempts,
    pollIntervalMs,
  };
  throw err;
}

module.exports = {
  createAliyunCloneVoiceModel,
  pollAliyunCloneVoiceModel,
};
