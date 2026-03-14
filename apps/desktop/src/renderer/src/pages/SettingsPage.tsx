import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import type { TestResult } from "@stockdesk/shared";
import styles from "./SettingsPage.module.css";

function isValidHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function SettingsPage() {
  const queryClient = useQueryClient();
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

  const [providerBaseUrl, setProviderBaseUrl] = useState("");
  const [result, setResult] = useState<TestResult | null>(null);
  const [lastProviderCheckAt, setLastProviderCheckAt] = useState<string | null>(null);
  const [lastLlmCheckAt, setLastLlmCheckAt] = useState<string | null>(null);

  useEffect(() => {
    setProviderBaseUrl(provider?.baseUrl ?? "");
  }, [provider?.baseUrl]);

  const saveProviderMutation = useMutation({
    mutationFn: async () => {
      if (!current || !provider) {
        throw new Error("当前没有可编辑的数据源配置。");
      }

      const baseUrl = providerBaseUrl.trim();
      if (!isValidHttpUrl(baseUrl)) {
        throw new Error("数据源 URL 必须是 http:// 或 https:// 地址。");
      }

      return window.stockdesk.settings.save({
        market: current.market,
        defaultGroupId: current.defaultGroupId,
        activeLlmProfileId: current.activeLlmProfileId,
        activeProviderProfileId: current.activeProviderProfileId,
        disclaimerAcceptedAt: current.disclaimerAcceptedAt,
        llmProfiles: current.llmProfiles.map((item) => ({
          id: item.id,
          name: item.name,
          baseUrl: item.baseUrl,
          model: item.model,
          timeoutMs: item.timeoutMs,
          maxRetries: item.maxRetries,
          supportsJsonSchema: item.supportsJsonSchema
        })),
        providerProfiles: current.providerProfiles.map((item) => ({
          id: item.id,
          providerType: item.providerType,
          baseUrl: item.id === provider.id ? baseUrl : item.baseUrl,
          enabled: item.enabled
        }))
      });
    },
    onSuccess: async (saved) => {
      queryClient.setQueryData(["settings"], saved);
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      setResult({
        ok: true,
        message: "数据源配置已保存。",
        details: {
          providerId: provider?.id ?? null,
          baseUrl: providerBaseUrl.trim()
        }
      });
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
    mutationFn: () => (profile ? window.stockdesk.settings.testLlmProfile(profile.id) : Promise.resolve({ ok: false, message: "未配置 LLM" })),
    onSuccess: (payload) => {
      setResult(payload);
      setLastLlmCheckAt(new Date().toISOString());
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
      <header>
        <span>设置</span>
        <h2>数据源、模型与缓存控制</h2>
      </header>

      <div className={styles.grid}>
        <article className={styles.panel}>
          <h3>数据源</h3>
          <label className={styles.field}>
            <span>服务地址</span>
            <input value={providerBaseUrl} onChange={(event) => setProviderBaseUrl(event.target.value)} placeholder="http://127.0.0.1:18765" />
          </label>
          <div className={styles.rowActions}>
            <button
              onClick={() => saveProviderMutation.mutate()}
              disabled={saveProviderMutation.isPending || !provider || !isValidHttpUrl(providerBaseUrl.trim())}
            >
              保存
            </button>
            <button onClick={() => testProvider.mutate()} disabled={testProvider.isPending || !provider}>
              测试数据服务
            </button>
          </div>
          <p className={styles.meta}>Provider: {provider?.providerType ?? "--"}</p>
          <p className={styles.meta}>最近检测: {lastProviderCheckAt ? dayjs(lastProviderCheckAt).format("YYYY-MM-DD HH:mm:ss") : "--"}</p>
        </article>

        <article className={styles.panel}>
          <h3>LLM</h3>
          <p className={styles.meta}>配置: {profile?.name ?? "未配置"}</p>
          <p className={styles.meta}>模型: {profile?.model ?? "--"}</p>
          <p className={styles.meta}>Base URL: {profile?.baseUrl ?? "--"}</p>
          <p className={styles.meta}>
            超时/重试: {profile?.timeoutMs ?? "--"}ms / {profile?.maxRetries ?? "--"}
          </p>
          <button onClick={() => testLlm.mutate()} disabled={testLlm.isPending || !profile}>
            测试模型
          </button>
          <p className={styles.meta}>最近检测: {lastLlmCheckAt ? dayjs(lastLlmCheckAt).format("YYYY-MM-DD HH:mm:ss") : "--"}</p>
        </article>

        <article className={styles.panel}>
          <h3>缓存</h3>
          <p className={styles.meta}>当前支持一键清理行情、K 线、新闻、事件缓存。</p>
          <p className={styles.meta}>清理后会在下次请求时自动重新拉取。</p>
          <button onClick={() => clearCacheMutation.mutate()} disabled={clearCacheMutation.isPending}>
            清理缓存
          </button>
        </article>
      </div>

      {result ? <div className={`${styles.message} ${result.ok ? styles.success : styles.error}`}>{result.message}</div> : null}
      {result?.details ? (
        <div className={styles.panel}>
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
