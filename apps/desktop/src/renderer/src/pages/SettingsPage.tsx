import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge, Button, Field, Input, Select, Switch, Textarea } from "@fluentui/react-components";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import type { LlmProtocol, TestResult } from "@stockdesk/shared";
import styles from "./SettingsPage.module.css";

function defaultProviderName(protocol: LlmProtocol) {
  if (protocol === "openrouter_api") {
    return "OpenRouter";
  }
  if (protocol === "bailian_responses_cn") {
    return "阿里云百炼";
  }
  return "OpenAI";
}

function parseAdvancedHeaders(value: string) {
  const parsed = JSON.parse(value || "{}") as Record<string, string>;
  return Object.keys(parsed).length > 0 ? parsed : null;
}

export function SettingsPage() {
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => window.stockdesk.settings.get()
  });
  const current = settingsQuery.data;

  const profile = useMemo(() => {
    if (!current?.activeLlmProfileId) {
      return current?.llmProfiles[0] ?? null;
    }
    return current.llmProfiles.find((item) => item.id === current.activeLlmProfileId) ?? current.llmProfiles[0] ?? null;
  }, [current]);

  const provider = useMemo(() => {
    if (!current?.activeProviderProfileId) {
      return current?.providerProfiles[0] ?? null;
    }
    return current.providerProfiles.find((item) => item.id === current.activeProviderProfileId) ?? current.providerProfiles[0] ?? null;
  }, [current]);

  const [result, setResult] = useState<TestResult | null>(null);
  const [lastProviderCheckAt, setLastProviderCheckAt] = useState<string | null>(null);
  const [lastLlmCheckAt, setLastLlmCheckAt] = useState<string | null>(null);
  const [protocol, setProtocol] = useState<LlmProtocol>("openai_chat_compatible");
  const [providerName, setProviderName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [timeoutMs, setTimeoutMs] = useState("30000");
  const [maxRetries, setMaxRetries] = useState("1");
  const [supportsJsonSchema, setSupportsJsonSchema] = useState(true);
  const [advancedHeadersText, setAdvancedHeadersText] = useState("{}");

  useEffect(() => {
    if (!profile) {
      return;
    }
    setProtocol(profile.protocol);
    setProviderName(profile.displayProviderName);
    setBaseUrl(profile.baseUrl);
    setModel(profile.model);
    setTimeoutMs(String(profile.timeoutMs));
    setMaxRetries(String(profile.maxRetries));
    setSupportsJsonSchema(profile.supportsJsonSchema);
    setAdvancedHeadersText(JSON.stringify(profile.advancedHeaders ?? {}, null, 2));
  }, [profile]);

  const saveLlmMutation = useMutation({
    mutationFn: async () => {
      if (!current || !profile) {
        throw new Error("没有可编辑的 LLM 配置。");
      }
      const parsedHeaders = parseAdvancedHeaders(advancedHeadersText);
      return window.stockdesk.settings.save({
        market: current.market,
        defaultGroupId: current.defaultGroupId,
        activeLlmProfileId: current.activeLlmProfileId,
        activeProviderProfileId: current.activeProviderProfileId,
        disclaimerAcceptedAt: current.disclaimerAcceptedAt,
        llmProfiles: current.llmProfiles.map((item) => item.id === profile.id
          ? {
              id: item.id,
              name: item.name,
              protocol,
              displayProviderName: providerName || defaultProviderName(protocol),
              baseUrl,
              model,
              timeoutMs: Number(timeoutMs),
              maxRetries: Number(maxRetries),
              supportsJsonSchema,
              advancedHeaders: parsedHeaders
            }
          : {
              id: item.id,
              name: item.name,
              protocol: item.protocol,
              displayProviderName: item.displayProviderName,
              baseUrl: item.baseUrl,
              model: item.model,
              timeoutMs: item.timeoutMs,
              maxRetries: item.maxRetries,
              supportsJsonSchema: item.supportsJsonSchema,
              advancedHeaders: item.advancedHeaders ?? null
            }),
        providerProfiles: current.providerProfiles.map((item) => ({
          id: item.id,
          providerType: item.providerType,
          baseUrl: item.baseUrl,
          enabled: item.enabled
        }))
      });
    },
    onSuccess: () => {
      setResult({ ok: true, message: "LLM 配置已保存。" });
    },
    onError: (error) => {
      setResult({ ok: false, message: error instanceof Error ? error.message : "保存失败。" });
    }
  });

  const testProvider = useMutation({
    mutationFn: () => window.stockdesk.settings.testDataSource(provider?.id),
    onSuccess: (payload) => {
      setResult(payload);
      setLastProviderCheckAt(new Date().toISOString());
    }
  });

  const testLlm = useMutation({
    mutationFn: () => {
      if (!profile) {
        return Promise.resolve({ ok: false, message: "未配置 LLM" });
      }

      return window.stockdesk.settings.testLlmProfile(profile.id, {
        protocol,
        displayProviderName: providerName || defaultProviderName(protocol),
        baseUrl,
        model,
        timeoutMs: Number(timeoutMs),
        maxRetries: Number(maxRetries),
        supportsJsonSchema,
        advancedHeaders: parseAdvancedHeaders(advancedHeadersText)
      });
    },
    onSuccess: (payload) => {
      setResult(payload);
      setLastLlmCheckAt(new Date().toISOString());
    }
  });

  const clearSecretsMutation = useMutation({
    mutationFn: async () => {
      if (!profile) {
        throw new Error("没有可清理的 LLM 配置。");
      }
      await window.stockdesk.settings.clearSecrets(profile.id);
    },
    onSuccess: () => {
      setResult({ ok: true, message: "当前 LLM Profile 的密钥已从系统钥匙串清理。" });
    },
    onError: (error) => {
      setResult({ ok: false, message: error instanceof Error ? error.message : "密钥清理失败。" });
    }
  });

  const clearCacheMutation = useMutation({
    mutationFn: async () => {
      const confirmed = window.confirm("确认清理全部缓存？将删除行情、K 线、新闻和事件缓存。");
      if (!confirmed) {
        return false;
      }
      await window.stockdesk.system.clearCache();
      return true;
    },
    onSuccess: (didClear) => {
      if (!didClear) {
        return;
      }
      setResult({ ok: true, message: "缓存已清理。" });
    },
    onError: (error) => {
      setResult({ ok: false, message: error instanceof Error ? error.message : "缓存清理失败。" });
    }
  });

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Badge appearance="filled" color="informative">
          Control Center
        </Badge>
        <span>设置</span>
        <h2>数据源、模型与缓存控制</h2>
      </header>

      <div className={styles.grid}>
        <article className={styles.panel}>
          <h3>数据源状态</h3>
          <p className={styles.meta}>模式: 内嵌本地数据服务</p>
          <p className={styles.meta}>Provider: {provider?.providerType ?? "--"}</p>
          <p className={styles.meta}>服务地址: {provider?.baseUrl ?? "--"}</p>
          <p className={styles.meta}>说明: 当前版本不支持把行情服务切到外部 URL，页面只展示实际生效的本地服务信息。</p>
          <div className={styles.rowActions}>
            <Button appearance="primary" onClick={() => testProvider.mutate()} disabled={testProvider.isPending || !provider}>
              测试数据服务
            </Button>
          </div>
          <p className={styles.meta}>最近检测: {lastProviderCheckAt ? dayjs(lastProviderCheckAt).format("YYYY-MM-DD HH:mm:ss") : "--"}</p>
        </article>

        <article className={styles.panel}>
          <h3>LLM</h3>
          <p className={styles.meta}>配置: {profile?.name ?? "未配置"}</p>
          <Field label="协议">
            <Select value={protocol} onChange={(event) => setProtocol(event.target.value as LlmProtocol)}>
              <option value="openai_chat_compatible">OpenAI Chat Compatible</option>
              <option value="openai_responses">OpenAI Responses</option>
              <option value="openrouter_api">OpenRouter API</option>
              <option value="bailian_responses_cn">阿里云百炼 Responses</option>
            </Select>
          </Field>
          <Field label="Provider 显示名">
            <Input value={providerName} onChange={(_, data) => setProviderName(data.value)} />
          </Field>
          <Field label="Base URL">
            <Input value={baseUrl} onChange={(_, data) => setBaseUrl(data.value)} />
          </Field>
          <Field label="模型">
            <Input value={model} onChange={(_, data) => setModel(data.value)} />
          </Field>
          <div className={styles.formGrid}>
            <Field label="超时(ms)">
              <Input value={timeoutMs} onChange={(_, data) => setTimeoutMs(data.value)} />
            </Field>
            <Field label="重试次数">
              <Input value={maxRetries} onChange={(_, data) => setMaxRetries(data.value)} />
            </Field>
          </div>
          <Field label="Advanced Headers JSON">
            <Textarea resize="vertical" value={advancedHeadersText} onChange={(_, data) => setAdvancedHeadersText(data.value)} />
          </Field>
          <Switch checked={supportsJsonSchema} label="启用严格 JSON Schema" onChange={(_, data) => setSupportsJsonSchema(Boolean(data.checked))} />
          <div className={styles.rowActions}>
            <Button appearance="secondary" onClick={() => saveLlmMutation.mutate()} disabled={saveLlmMutation.isPending || !profile}>
              保存配置
            </Button>
            <Button appearance="primary" onClick={() => testLlm.mutate()} disabled={testLlm.isPending || !profile}>
              测试模型
            </Button>
            <Button appearance="secondary" onClick={() => clearSecretsMutation.mutate()} disabled={clearSecretsMutation.isPending || !profile}>
              清理密钥
            </Button>
          </div>
          <p className={styles.meta}>密钥存储: 系统钥匙串 / Keyring</p>
          <p className={styles.meta}>最近检测: {lastLlmCheckAt ? dayjs(lastLlmCheckAt).format("YYYY-MM-DD HH:mm:ss") : "--"}</p>
        </article>

        <article className={styles.panel}>
          <h3>缓存</h3>
          <p className={styles.meta}>当前支持一键清理行情、K 线、新闻、事件缓存。</p>
          <p className={styles.meta}>清理后会在下次请求时自动重新拉取。</p>
          <Button appearance="secondary" onClick={() => clearCacheMutation.mutate()} disabled={clearCacheMutation.isPending}>
            清理缓存
          </Button>
        </article>

        <article className={styles.panel}>
          <h3>环境</h3>
          <p className={styles.meta}>平台目标: Windows 优先</p>
          <p className={styles.meta}>桌面框架: Electron + React + Fluent UI</p>
          <p className={styles.meta}>本地服务: FastAPI + AKShare + SQLite</p>
          <p className={styles.meta}>建议: 在 Windows Node 24 LTS + Python 3.13 环境完成打包和联调。</p>
        </article>
      </div>

      {result ? <div className={`${styles.message} ${result.ok ? styles.success : styles.error}`}>{result.message}</div> : null}
      {result?.details ? (
        <div className={styles.detailPanel}>
          {Object.entries(result.details).map(([key, value]) => (
            <p key={key} className={styles.meta}>
              <strong>{key}:</strong> {String(value ?? "")}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
