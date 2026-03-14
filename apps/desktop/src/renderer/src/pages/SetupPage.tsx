import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./SetupPage.module.css";

const API_KEY_CACHE_KEY = "stockdesk.setup.apiKey";

function readCachedApiKey() {
  try {
    return window.localStorage.getItem(API_KEY_CACHE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeCachedApiKey(value: string) {
  try {
    if (value.length > 0) {
      window.localStorage.setItem(API_KEY_CACHE_KEY, value);
    } else {
      window.localStorage.removeItem(API_KEY_CACHE_KEY);
    }
  } catch {
    // Ignore cache write failures in restricted environments.
  }
}

export function SetupPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [providerBaseUrl, setProviderBaseUrl] = useState("http://127.0.0.1:18765");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [model, setModel] = useState("gpt5.2");
  const [apiKey, setApiKey] = useState(readCachedApiKey);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
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
            name: "默认模型",
            baseUrl,
            model,
            timeoutMs: 30000,
            maxRetries: 1,
            supportsJsonSchema: true,
            apiKey
          }
        ],
        providerProfiles: [
          {
            id: providerId,
            providerType: "akshare",
            baseUrl: providerBaseUrl,
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
        <span>Windows Electron 本地客户端</span>
        <h1>先完成本地数据与 LLM 配置</h1>
        <p>首版默认市场为 A 股。所有缓存、配置和分析记录均保存在本地。</p>
      </div>
      <form className={styles.form} onSubmit={handleSubmit}>
        <label>
          <span>本地数据服务</span>
          <input value={providerBaseUrl} onChange={(event) => setProviderBaseUrl(event.target.value)} />
        </label>
        <label>
          <span>LLM Base URL</span>
          <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
        </label>
        <label>
          <span>模型名</span>
          <input placeholder="gpt5.2" value={model} onChange={(event) => setModel(event.target.value)} />
        </label>
        <label>
          <span>API Key</span>
          <input
            type="password"
            value={apiKey}
            onChange={(event) => {
              const value = event.target.value;
              setApiKey(value);
              writeCachedApiKey(value);
            }}
          />
        </label>
        {message ? <div className={styles.error}>{message}</div> : null}
        <button type="submit" disabled={saving}>
          {saving ? "保存中..." : "完成初始化"}
        </button>
      </form>
    </section>
  );
}
