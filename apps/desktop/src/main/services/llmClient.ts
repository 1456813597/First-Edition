import { analysisResultSchema, type AnalysisResultV1, type LlmProfile } from "@stockdesk/shared";

interface LlmCallInput {
  profile: LlmProfile;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
}

interface LlmCallResult {
  result: AnalysisResultV1;
  rawResponse: string;
  validationReport: string;
}

async function callChatCompletion(input: LlmCallInput, repairMessage?: string) {
  const body: Record<string, unknown> = {
    model: input.profile.model,
    temperature: 0.2,
    messages: [
      { role: "system", content: input.systemPrompt },
      { role: "user", content: input.userPrompt },
      ...(repairMessage ? [{ role: "user", content: repairMessage }] : [])
    ]
  };

  if (input.profile.supportsJsonSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: "analysis_result",
        strict: true,
        schema: {
          type: "object"
        }
      }
    };
  } else {
    body.response_format = { type: "json_object" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.profile.timeoutMs);
  try {
    const response = await fetch(new URL("/chat/completions", input.profile.baseUrl).toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`LLM call failed: ${response.status}`);
    }

    return (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
  } finally {
    clearTimeout(timeout);
  }
}

export class LlmClient {
  async analyze(input: LlmCallInput): Promise<LlmCallResult> {
    const first = await callChatCompletion(input);
    const rawResponse = first.choices[0]?.message?.content ?? "";
    const validation = analysisResultSchema.safeParse(JSON.parse(rawResponse));
    if (validation.success) {
      return {
        result: validation.data as AnalysisResultV1,
        rawResponse,
        validationReport: "validation:ok"
      };
    }

    const repair = await callChatCompletion(
      input,
      `上一次输出未通过校验，请仅输出修复后的 JSON。错误: ${validation.error.issues.map((issue) => issue.message).join("; ")}`
    );
    const repairedRaw = repair.choices[0]?.message?.content ?? "";
    const repairedValidation = analysisResultSchema.safeParse(JSON.parse(repairedRaw));
    if (!repairedValidation.success) {
      throw new Error(`Structured output validation failed: ${repairedValidation.error.message}`);
    }

    return {
      result: repairedValidation.data as AnalysisResultV1,
      rawResponse: repairedRaw,
      validationReport: `validation:repair:${validation.error.issues.length}`
    };
  }
}

