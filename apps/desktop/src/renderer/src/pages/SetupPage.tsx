import { Badge, Button, Field, Input, Select, Switch, Textarea } from "@fluentui/react-components";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { LlmProtocol } from "@stockdesk/shared";
import styles from "./SetupPage.module.css";

const EMBEDDED_DATA_SERVICE_URL = "http://127.0.0.1:18765";

function defaultBaseUrl(protocol: LlmProtocol) {
  if (protocol === "openai_responses" || protocol === "openai_chat_compatible") {
    return "https://api.openai.com/v1";
  }
  if (protocol === "openrouter_api") {
    return "https://openrouter.ai/api/v1";
  }
  return "https://dashscope.aliyuncs.com/compatible-mode/v1";
}

function defaultProviderName(protocol: LlmProtocol) {
  if (protocol === "openai_responses" || protocol === "openai_chat_compatible") {
    return "OpenAI";
  }
  if (protocol === "openrouter_api") {
    return "OpenRouter";
  }
  return "阿里云百炼";
}

export function SetupPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [protocol, setProtocol] = useState<LlmProtocol>("openai_chat_compatible");
  const [providerName, setProviderName] = useState(defaultProviderName("openai_chat_compatible"));
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl("openai_chat_compatible"));
  const [model, setModel] = useState("gpt5.2");
  const [supportsJsonSchema, setSupportsJsonSchema] = useState(true);
  const [advancedHeadersText, setAdvancedHeadersText] = useState("{}");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const parsedHeaders = JSON.parse(advancedHeadersText || "{}") as Record<string, string>;
      const providerId = crypto.randomUUID();
      const llmId = crypto.randomUUID();
      const savedSettings = await window.stockdesk.settings.save({
        market: "CN_A",
        disclaimerAcceptedAt: new Date().toISOString(),
        activeProviderProfileId: providerId,
        activeLlmProfileId: llmId,
        llmProfiles: [
          {
            id: llmId,
            name: `${providerName} 默认模型`,
            protocol,
            displayProviderName: providerName,
            baseUrl,
            model,
            timeoutMs: 30000,
            maxRetries: 1,
            supportsJsonSchema,
            advancedHeaders: Object.keys(parsedHeaders).length > 0 ? parsedHeaders : null,
            apiKey
          }
        ],
        providerProfiles: [
          {
            id: providerId,
            providerType: "akshare",
            baseUrl: EMBEDDED_DATA_SERVICE_URL,
            enabled: true
          }
        ]
      });
      const bootstrap =
        (await window.stockdesk.bootstrap.get().catch(() => null))
        ?? {
          settings: savedSettings,
          groups: []
        };

      queryClient.setQueryData(["settings"], savedSettings);
      queryClient.setQueryData(["bootstrap"], bootstrap);
      navigate("/", { replace: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "初始化失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.page}>
      <div className={styles.hero}>
        <Badge appearance="filled" color="informative">
          Windows Native Styled
        </Badge>
        <span>Windows Electron 本地客户端</span>
        <h1>先完成本地数据与 LLM 配置</h1>
        <p>首版默认市场为 A 股。缓存、配置和分析记录落在本地，API Key 只写入系统钥匙串，不再明文保存在浏览器存储中。</p>
        <div className={styles.heroStats}>
          <div>
            <strong>数据源</strong>
            <span>嵌入式本地服务</span>
          </div>
          <div>
            <strong>分析模式</strong>
            <span>结构化 JSON 输出</span>
          </div>
          <div>
            <strong>运行环境</strong>
            <span>Electron + FastAPI + SQLite</span>
          </div>
        </div>
      </div>
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.readonlyField}>
          <span>本地数据服务</span>
          <strong>内嵌数据服务</strong>
          <small>{EMBEDDED_DATA_SERVICE_URL}</small>
        </div>
        <Field label="协议">
          <Select
            value={protocol}
            onChange={(event) => {
              const nextProtocol = event.target.value as LlmProtocol;
              setProtocol(nextProtocol);
              setProviderName(defaultProviderName(nextProtocol));
              setBaseUrl(defaultBaseUrl(nextProtocol));
            }}
          >
            <option value="openai_chat_compatible">OpenAI Chat Compatible</option>
            <option value="openai_responses">OpenAI Responses</option>
            <option value="openrouter_api">OpenRouter API</option>
            <option value="bailian_responses_cn">阿里云百炼 Responses</option>
          </Select>
        </Field>
        <Field label="Provider 显示名">
          <Input value={providerName} onChange={(_, data) => setProviderName(data.value)} />
        </Field>
        <Field label="LLM Base URL">
          <Input value={baseUrl} onChange={(_, data) => setBaseUrl(data.value)} />
        </Field>
        <Field label="模型名">
          <Input placeholder="gpt5.2" value={model} onChange={(_, data) => setModel(data.value)} />
        </Field>
        <Field label="API Key">
          <Input
            type="password"
            value={apiKey}
            autoComplete="off"
            onChange={(_, data) => setApiKey(data.value)}
          />
        </Field>
        <Field label="Advanced Headers JSON">
          <Textarea
            resize="vertical"
            value={advancedHeadersText}
            onChange={(_, data) => setAdvancedHeadersText(data.value)}
          />
        </Field>
        <div className={styles.switchRow}>
          <Switch
            checked={supportsJsonSchema}
            label="启用严格 JSON Schema"
            onChange={(_, data) => setSupportsJsonSchema(Boolean(data.checked))}
          />
        </div>
        {message ? <div className={styles.error}>{message}</div> : null}
        <Button appearance="primary" type="submit" disabled={saving}>
          {saving ? "保存中..." : "完成初始化"}
        </Button>
      </form>
    </section>
  );
}
