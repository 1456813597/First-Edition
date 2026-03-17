import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { researchPlanJsonSchema, researchPlanSchema, type LlmProfile, type LlmProtocol } from "@stockdesk/shared";
import { LlmClient } from "./llmClient";
import { getLlmProtocolAdapter } from "./llmProtocolAdapters";

function makeProfile(protocol: LlmProtocol, overrides: Partial<LlmProfile> = {}): LlmProfile {
  const now = new Date().toISOString();
  return {
    id: `${protocol}-profile`,
    name: `${protocol} profile`,
    protocol,
    displayProviderName: protocol,
    baseUrl:
      protocol === "openrouter_api"
        ? "https://openrouter.ai/api/v1"
        : protocol === "bailian_responses_cn"
          ? "https://dashscope.aliyuncs.com/compatible-mode/v1"
          : "https://api.openai.com/v1",
    model: "test-model",
    timeoutMs: 30000,
    maxRetries: 1,
    supportsJsonSchema: true,
    advancedHeaders: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function chatPayload(content: string) {
  return {
    id: "chat-resp-1",
    model: "chat-model",
    usage: { total_tokens: 12 },
    choices: [
      {
        finish_reason: "stop",
        message: {
          content
        }
      }
    ]
  };
}

function responsesPayload(content: string) {
  return {
    id: "resp-1",
    model: "responses-model",
    status: "completed",
    usage: { total_tokens: 9 },
    output_text: content
  };
}

describe("LLM protocol adapters", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("sends OpenAI Responses requests to /responses and normalizes the payload", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(responsesPayload("{\"ok\":true}")), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    const adapter = getLlmProtocolAdapter("openai_responses");
    const result = await adapter.invokeStructured(makeProfile("openai_responses"), "sk-test", {
      systemPrompt: "system",
      userPrompt: "user",
      schemaName: "schema",
      jsonSchema: { type: "object" },
      preferStrictSchema: true
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://api.openai.com/v1/responses");
    expect(result.text).toBe("{\"ok\":true}");
    expect(result.finishReason).toBe("completed");
  });

  it("falls back to a minimal Responses probe when /models is unavailable", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("missing", { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(responsesPayload("pong")), { status: 200 }));

    const adapter = getLlmProtocolAdapter("openai_responses");
    await adapter.testConnection(makeProfile("openai_responses"), "sk-test");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://api.openai.com/v1/models");
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("https://api.openai.com/v1/responses");
  });

  it("sends OpenAI chat-compatible requests to /chat/completions and normalizes the payload", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(chatPayload("{\"ok\":true}")), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    const adapter = getLlmProtocolAdapter("openai_chat_compatible");
    const result = await adapter.invokeStructured(makeProfile("openai_chat_compatible"), "sk-test", {
      systemPrompt: "system",
      userPrompt: "user",
      schemaName: "schema",
      jsonSchema: { type: "object" },
      preferStrictSchema: true
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://api.openai.com/v1/chat/completions");
    expect(result.text).toBe("{\"ok\":true}");
    expect(result.finishReason).toBe("stop");
  });

  it("falls back to a minimal chat probe when /models is unavailable", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("missing", { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(chatPayload("pong")), { status: 200 }));

    const adapter = getLlmProtocolAdapter("openai_chat_compatible");
    await adapter.testConnection(makeProfile("openai_chat_compatible"), "sk-test");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://api.openai.com/v1/models");
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("does not use fallback probes in models_only mode", async () => {
    fetchMock.mockResolvedValueOnce(new Response("missing", { status: 404 }));

    const adapter = getLlmProtocolAdapter("openai_chat_compatible");
    await expect(adapter.testConnection(makeProfile("openai_chat_compatible"), "sk-test", "models_only")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://api.openai.com/v1/models");
  });

  it("passes advanced headers through OpenRouter requests", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(chatPayload("{\"ok\":true}")), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    const adapter = getLlmProtocolAdapter("openrouter_api");
    await adapter.invokeStructured(
      makeProfile("openrouter_api", {
        advancedHeaders: {
          "HTTP-Referer": "https://stockdesk.local",
          "X-Title": "StockDesk"
        }
      }),
      "sk-test",
      {
        systemPrompt: "system",
        userPrompt: "user",
        schemaName: "schema",
        jsonSchema: { type: "object" },
        preferStrictSchema: true
      }
    );

    const request = fetchMock.mock.calls[0]?.[1];
    const headers = request?.headers as Record<string, string>;
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(headers["HTTP-Referer"]).toBe("https://stockdesk.local");
    expect(headers["X-Title"]).toBe("StockDesk");
  });

  it("falls back to a minimal OpenRouter chat probe when /models is unavailable", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("missing", { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(chatPayload("pong")), { status: 200 }));

    const adapter = getLlmProtocolAdapter("openrouter_api");
    await adapter.testConnection(makeProfile("openrouter_api"), "sk-test");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://openrouter.ai/api/v1/models");
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("https://openrouter.ai/api/v1/chat/completions");
  });

  it("normalizes chat content arrays returned by some compatible providers", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "chat-array-1",
          model: "chat-model",
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: [
                  { type: "output_text", text: "{\"ok\":" },
                  { type: "output_text", text: "true}" }
                ]
              }
            }
          ]
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      )
    );

    const adapter = getLlmProtocolAdapter("openai_chat_compatible");
    const result = await adapter.invokeStructured(makeProfile("openai_chat_compatible"), "sk-test", {
      systemPrompt: "system",
      userPrompt: "user",
      schemaName: "schema",
      jsonSchema: { type: "object" },
      preferStrictSchema: true
    });

    expect(result.text).toBe("{\"ok\":\ntrue}");
  });

  it("sends Bailian Responses requests to /responses", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(responsesPayload("{\"ok\":true}")), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    const adapter = getLlmProtocolAdapter("bailian_responses_cn");
    const result = await adapter.invokeStructured(makeProfile("bailian_responses_cn"), "sk-test", {
      systemPrompt: "system",
      userPrompt: "user",
      schemaName: "schema",
      jsonSchema: { type: "object" },
      preferStrictSchema: false
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1/responses");
    expect(result.text).toBe("{\"ok\":true}");
  });

  it("falls back to a minimal Bailian Responses probe when /models is unavailable", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("missing", { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(responsesPayload("pong")), { status: 200 }));

    const adapter = getLlmProtocolAdapter("bailian_responses_cn");
    await adapter.testConnection(makeProfile("bailian_responses_cn"), "sk-test");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1/models");
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1/responses");
  });

  it("retries with a repair message when structured JSON validation fails", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify(chatPayload("not json")), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            chatPayload(JSON.stringify({
              schemaVersion: "analysis.stage.research_plan.v1",
              focusAreas: ["趋势", "成交量"],
              keyQuestions: ["是否存在量价背离"],
              evidencePriorities: ["技术面", "板块联动"],
              dataGaps: [],
              recommendedExpansions: ["复盘历史观点"]
            }))
          ),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        )
      );

    const client = new LlmClient();
    const result = await client.invokeStructured({
      profile: makeProfile("openai_chat_compatible", { maxRetries: 1 }),
      apiKey: "sk-test",
      systemPrompt: "system",
      userPrompt: "user",
      schemaName: "research_plan_v1",
      schema: researchPlanSchema,
      jsonSchema: researchPlanJsonSchema
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.result.schemaVersion).toBe("analysis.stage.research_plan.v1");
    expect(result.validationReport).toBe("validation:repair:attempt-2");

    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(secondBody.messages[1]?.content).toContain("错误详情");
    expect(secondBody.messages[1]?.content).toContain("只允许输出一个 JSON 对象");
  });
});
