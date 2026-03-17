import type { ZodType } from "zod";
import type { LlmProbeMode, LlmProfile } from "@stockdesk/shared";
import { getLlmProtocolAdapter, type NormalizedLlmResponse } from "./llmProtocolAdapters";

export interface StructuredLlmResult<T> {
  result: T;
  rawResponse: string;
  rawPayload: string;
  validationReport: string;
  requestId: string | null;
  usage: Record<string, unknown> | null;
  model: string | null;
  finishReason: string | null;
}

interface InvokeStructuredInput<T> {
  profile: LlmProfile;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
  schema: ZodType<T>;
  jsonSchema: Record<string, unknown>;
}

function extractJsonText(rawResponse: string): string {
  const trimmed = rawResponse.trim();
  if (!trimmed) {
    throw new Error("LLM returned an empty response.");
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end >= start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

function parseStructuredResult<T>(schema: ZodType<T>, response: NormalizedLlmResponse) {
  const jsonText = extractJsonText(response.text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`LLM returned invalid JSON: ${error instanceof Error ? error.message : "unknown parse error"}`);
  }

  const validation = schema.safeParse(parsed);
  if (!validation.success) {
    throw new Error(validation.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; "));
  }

  return {
    jsonText,
    result: validation.data
  };
}

export class LlmClient {
  async testProfile(profile: LlmProfile, apiKey: string, probeMode: LlmProbeMode = "models_then_minimal") {
    const adapter = getLlmProtocolAdapter(profile.protocol);
    await adapter.testConnection(profile, apiKey, probeMode);
  }

  async invokeStructured<T>(input: InvokeStructuredInput<T>): Promise<StructuredLlmResult<T>> {
    const adapter = getLlmProtocolAdapter(input.profile.protocol);
    let repairMessage: string | undefined;
    let lastError: Error | null = null;
    let lastResponse: NormalizedLlmResponse | null = null;

    for (let attempt = 0; attempt <= input.profile.maxRetries; attempt += 1) {
      try {
        const response = await adapter.invokeStructured(input.profile, input.apiKey, {
          systemPrompt: input.systemPrompt,
          userPrompt: repairMessage ? `${input.userPrompt}\n\n${repairMessage}` : input.userPrompt,
          schemaName: input.schemaName,
          jsonSchema: input.jsonSchema,
          preferStrictSchema: input.profile.supportsJsonSchema
        });
        lastResponse = response;
        const parsed = parseStructuredResult(input.schema, response);
        return {
          result: parsed.result,
          rawResponse: parsed.jsonText,
          rawPayload: response.rawPayload,
          validationReport: attempt === 0 ? "validation:ok" : `validation:repair:attempt-${attempt + 1}`,
          requestId: response.requestId,
          usage: response.usage,
          model: response.model,
          finishReason: response.finishReason
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt >= input.profile.maxRetries) {
          break;
        }
        repairMessage = [
          "上一次输出未通过校验，请严格修复后重新输出。",
          "只允许输出一个 JSON 对象，不要输出 Markdown、解释或代码块。",
          `错误详情: ${lastError.message}`,
          lastResponse?.text ? `上一次文本输出: ${lastResponse.text}` : null
        ]
          .filter(Boolean)
          .join("\n");
      }
    }

    throw new Error(`Structured output validation failed: ${lastError?.message ?? "unknown error"}`);
  }
}
