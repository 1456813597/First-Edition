import type { LlmProbeMode, LlmProfile, LlmProtocol } from "@stockdesk/shared";

export interface StructuredLlmRequest {
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  preferStrictSchema: boolean;
}

export interface NormalizedLlmResponse {
  text: string;
  rawPayload: string;
  requestId: string | null;
  usage: Record<string, unknown> | null;
  model: string | null;
  finishReason: string | null;
}

export interface LlmProtocolAdapter {
  protocol: LlmProtocol;
  testConnection(profile: LlmProfile, apiKey: string, probeMode?: LlmProbeMode): Promise<void>;
  invokeStructured(profile: LlmProfile, apiKey: string, request: StructuredLlmRequest): Promise<NormalizedLlmResponse>;
}

function joinUrl(baseUrl: string, path: string) {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return `${normalizedBase}/${normalizedPath}`;
}

function buildHeaders(profile: LlmProfile, apiKey: string, extra?: Record<string, string>) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    ...(profile.advancedHeaders ?? {}),
    ...(extra ?? {})
  };
}

async function ensureOk(response: Response, fallbackMessage: string) {
  if (response.ok) {
    return;
  }
  const text = await response.text().catch(() => "");
  throw new Error(text.trim() ? `${fallbackMessage}: ${text.trim()}` : fallbackMessage);
}

async function tryModelsEndpoint(profile: LlmProfile, apiKey: string, failureMessage: string) {
  const response = await fetch(joinUrl(profile.baseUrl, "models"), {
    headers: buildHeaders(profile, apiKey)
  });
  await ensureOk(response, failureMessage);
}

async function testConnectionWithFallback(
  profile: LlmProfile,
  apiKey: string,
  modelsFailureMessage: string,
  probeMode: LlmProbeMode,
  fallbackProbe: () => Promise<void>
) {
  try {
    await tryModelsEndpoint(profile, apiKey, modelsFailureMessage);
    return;
  } catch (modelsError) {
    if (probeMode === "models_only") {
      throw modelsError;
    }
    try {
      await fallbackProbe();
      return;
    } catch (probeError) {
      const modelsMessage = modelsError instanceof Error ? modelsError.message : String(modelsError);
      const probeMessage = probeError instanceof Error ? probeError.message : String(probeError);
      throw new Error(`${modelsMessage}; fallback probe failed: ${probeMessage}`);
    }
  }
}

function stringifyPayload(payload: unknown) {
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function extractChatText(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content ?? "";
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (typeof part?.text === "string") {
          return part.text;
        }
        return typeof part?.content === "string" ? part.content : null;
      })
      .filter((part): part is string => Boolean(part))
      .join("\n");
  }
  return "";
}

function normalizeChatPayload(payload: any): NormalizedLlmResponse {
  return {
    text: extractChatText(payload),
    rawPayload: stringifyPayload(payload),
    requestId: payload?.id ?? null,
    usage: payload?.usage ?? null,
    model: payload?.model ?? null,
    finishReason: payload?.choices?.[0]?.finish_reason ?? null
  };
}

function extractResponsesText(payload: any): string {
  if (typeof payload?.output_text === "string" && payload.output_text.length > 0) {
    return payload.output_text;
  }

  const output = Array.isArray(payload?.output) ? payload.output : [];
  const parts: string[] = [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const chunk of content) {
      const text = chunk?.text ?? chunk?.output_text ?? chunk?.content?.[0]?.text ?? null;
      if (typeof text === "string" && text.length > 0) {
        parts.push(text);
      }
    }
  }
  return parts.join("\n");
}

function normalizeResponsesPayload(payload: any): NormalizedLlmResponse {
  return {
    text: extractResponsesText(payload),
    rawPayload: stringifyPayload(payload),
    requestId: payload?.id ?? null,
    usage: payload?.usage ?? null,
    model: payload?.model ?? null,
    finishReason: payload?.status ?? null
  };
}

class OpenAIResponsesAdapter implements LlmProtocolAdapter {
  readonly protocol = "openai_responses" as const;

  async testConnection(profile: LlmProfile, apiKey: string, probeMode: LlmProbeMode = "models_then_minimal") {
    await testConnectionWithFallback(profile, apiKey, "Responses profile test failed", probeMode, async () => {
      const response = await fetch(joinUrl(profile.baseUrl, "responses"), {
        method: "POST",
        headers: buildHeaders(profile, apiKey),
        body: JSON.stringify({
          model: profile.model,
          max_output_tokens: 1,
          input: [
            {
              role: "user",
              content: [{ type: "input_text", text: "ping" }]
            }
          ]
        })
      });
      await ensureOk(response, "Responses fallback probe failed");
    });
  }

  async invokeStructured(profile: LlmProfile, apiKey: string, request: StructuredLlmRequest): Promise<NormalizedLlmResponse> {
    const body: Record<string, unknown> = {
      model: profile.model,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: request.systemPrompt }]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: request.userPrompt }]
        }
      ]
    };

    body.text = {
      format: request.preferStrictSchema
        ? {
            type: "json_schema",
            name: request.schemaName,
            strict: true,
            schema: request.jsonSchema
          }
        : {
            type: "json_object"
          }
    };

    const response = await fetch(joinUrl(profile.baseUrl, "responses"), {
      method: "POST",
      headers: buildHeaders(profile, apiKey),
      body: JSON.stringify(body)
    });
    await ensureOk(response, "Responses request failed");
    return normalizeResponsesPayload(await response.json());
  }
}

class OpenAIChatCompatibleAdapter implements LlmProtocolAdapter {
  readonly protocol = "openai_chat_compatible" as const;

  async testConnection(profile: LlmProfile, apiKey: string, probeMode: LlmProbeMode = "models_then_minimal") {
    await testConnectionWithFallback(profile, apiKey, "Chat-compatible profile test failed", probeMode, async () => {
      const response = await fetch(joinUrl(profile.baseUrl, "chat/completions"), {
        method: "POST",
        headers: buildHeaders(profile, apiKey),
        body: JSON.stringify({
          model: profile.model,
          max_tokens: 1,
          temperature: 0,
          messages: [{ role: "user", content: "ping" }]
        })
      });
      await ensureOk(response, "Chat-compatible fallback probe failed");
    });
  }

  async invokeStructured(profile: LlmProfile, apiKey: string, request: StructuredLlmRequest): Promise<NormalizedLlmResponse> {
    const body: Record<string, unknown> = {
      model: profile.model,
      temperature: 0.2,
      messages: [
        { role: "system", content: request.systemPrompt },
        { role: "user", content: request.userPrompt }
      ]
    };

    body.response_format = request.preferStrictSchema
      ? {
          type: "json_schema",
          json_schema: {
            name: request.schemaName,
            strict: true,
            schema: request.jsonSchema
          }
        }
      : {
          type: "json_object"
        };

    const response = await fetch(joinUrl(profile.baseUrl, "chat/completions"), {
      method: "POST",
      headers: buildHeaders(profile, apiKey),
      body: JSON.stringify(body)
    });
    await ensureOk(response, "Chat-compatible request failed");
    return normalizeChatPayload(await response.json());
  }
}

class OpenRouterApiAdapter implements LlmProtocolAdapter {
  readonly protocol = "openrouter_api" as const;

  async testConnection(profile: LlmProfile, apiKey: string, probeMode: LlmProbeMode = "models_then_minimal") {
    await testConnectionWithFallback(profile, apiKey, "OpenRouter profile test failed", probeMode, async () => {
      const response = await fetch(joinUrl(profile.baseUrl, "chat/completions"), {
        method: "POST",
        headers: buildHeaders(profile, apiKey),
        body: JSON.stringify({
          model: profile.model,
          max_tokens: 1,
          temperature: 0,
          messages: [{ role: "user", content: "ping" }]
        })
      });
      await ensureOk(response, "OpenRouter fallback probe failed");
    });
  }

  async invokeStructured(profile: LlmProfile, apiKey: string, request: StructuredLlmRequest): Promise<NormalizedLlmResponse> {
    const response = await fetch(joinUrl(profile.baseUrl, "chat/completions"), {
      method: "POST",
      headers: buildHeaders(profile, apiKey),
      body: JSON.stringify({
        model: profile.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.userPrompt }
        ],
        response_format: request.preferStrictSchema
          ? {
              type: "json_schema",
              json_schema: {
                name: request.schemaName,
                strict: true,
                schema: request.jsonSchema
              }
            }
          : {
              type: "json_object"
            }
      })
    });
    await ensureOk(response, "OpenRouter request failed");
    return normalizeChatPayload(await response.json());
  }
}

class BailianResponsesCnAdapter implements LlmProtocolAdapter {
  readonly protocol = "bailian_responses_cn" as const;

  async testConnection(profile: LlmProfile, apiKey: string, probeMode: LlmProbeMode = "models_then_minimal") {
    await testConnectionWithFallback(profile, apiKey, "Bailian Responses profile test failed", probeMode, async () => {
      const response = await fetch(joinUrl(profile.baseUrl, "responses"), {
        method: "POST",
        headers: buildHeaders(profile, apiKey),
        body: JSON.stringify({
          model: profile.model,
          max_output_tokens: 1,
          input: [
            {
              role: "user",
              content: [{ type: "input_text", text: "ping" }]
            }
          ]
        })
      });
      await ensureOk(response, "Bailian Responses fallback probe failed");
    });
  }

  async invokeStructured(profile: LlmProfile, apiKey: string, request: StructuredLlmRequest): Promise<NormalizedLlmResponse> {
    const response = await fetch(joinUrl(profile.baseUrl, "responses"), {
      method: "POST",
      headers: buildHeaders(profile, apiKey),
      body: JSON.stringify({
        model: profile.model,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: request.systemPrompt }]
          },
          {
            role: "user",
            content: [{ type: "input_text", text: request.userPrompt }]
          }
        ],
        text: {
          format: request.preferStrictSchema
            ? {
                type: "json_schema",
                name: request.schemaName,
                strict: true,
                schema: request.jsonSchema
              }
            : {
                type: "json_object"
              }
        }
      })
    });
    await ensureOk(response, "Bailian Responses request failed");
    return normalizeResponsesPayload(await response.json());
  }
}

const adapters: Record<LlmProtocol, LlmProtocolAdapter> = {
  openai_responses: new OpenAIResponsesAdapter(),
  openai_chat_compatible: new OpenAIChatCompatibleAdapter(),
  openrouter_api: new OpenRouterApiAdapter(),
  bailian_responses_cn: new BailianResponsesCnAdapter()
};

export function getLlmProtocolAdapter(protocol: LlmProtocol): LlmProtocolAdapter {
  return adapters[protocol];
}
