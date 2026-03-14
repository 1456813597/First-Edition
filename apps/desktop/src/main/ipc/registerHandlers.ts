import { readFile } from "node:fs/promises";
import path from "node:path";
import { ipcMain, dialog, shell, type IpcMainInvokeEvent } from "electron";
import { ipcContract, type IpcChannel, type ImportPreview, type QuoteSnapshot, saveSettingsInputSchema } from "@stockdesk/shared";
import { attachIndicators } from "@stockdesk/analysis-core";
import type { AppContext } from "../appContext";

function ensureTrustedFrame(event: IpcMainInvokeEvent) {
  const senderUrl = event.senderFrame?.url ?? "";
  if (
    !senderUrl.startsWith("app://")
    && !senderUrl.startsWith("http://localhost")
    && !senderUrl.startsWith("http://127.0.0.1")
    && !senderUrl.startsWith("file://")
  ) {
    throw new Error("Untrusted frame.");
  }
}

function handle<TChannel extends IpcChannel>(
  channel: TChannel,
  handler: (input: unknown, event: IpcMainInvokeEvent) => Promise<unknown> | unknown
) {
  const contract = ipcContract[channel];
  ipcMain.handle(channel, async (event, rawInput) => {
    ensureTrustedFrame(event);
    const input = contract.input.parse(rawInput);
    const output = await handler(input, event);
    return contract.output.parse(output);
  });
}

function parseCachedJson<T>(payload: string | undefined): T | null {
  if (!payload) {
    return null;
  }

  try {
    return JSON.parse(payload) as T;
  } catch {
    return null;
  }
}

function buildKlineCacheKey(input: { symbol: string; timeframe: string; adjustMode: string; start?: string; end?: string }) {
  return `${input.symbol}|${input.timeframe}|${input.adjustMode}|${input.start ?? ""}|${input.end ?? ""}`;
}

function buildNewsCacheKey(symbol: string, input: { start?: string; end?: string; limit?: number }) {
  return `${symbol}|${input.start ?? ""}|${input.end ?? ""}|${input.limit ?? 20}`;
}

export function registerHandlers(context: AppContext) {
  handle("bootstrap:get", async () => ({
    settings: context.settingsRepo.getSettings(),
    groups: context.watchlistRepo.listGroups()
  }));

  handle("watchlist:listGroups", async () => context.watchlistRepo.listGroups());
  handle("watchlist:saveGroup", async (input) => context.watchlistRepo.saveGroup(input as { id?: string; name: string; color?: string | null }));
  handle("watchlist:deleteGroup", async (input) => {
    context.watchlistRepo.deleteGroup((input as { id: string }).id);
  });
  handle("watchlist:listItems", async (input) => context.watchlistRepo.listItems((input as { groupId?: string | null } | undefined)?.groupId));
  handle("watchlist:addSymbols", async (input) => context.watchlistRepo.addSymbols(input as { symbols: string[]; groupId?: string | null; tags?: string[] }));
  handle("watchlist:removeItems", async (input) => {
    context.watchlistRepo.removeItems((input as { ids: string[] }).ids);
  });
  handle("watchlist:importCsv", async (input) => {
    const content = await readFile((input as { path: string }).path, "utf8");
    return context.watchlistRepo.importPreview(content);
  });
  handle("watchlist:applyImportPreview", async (input) => context.watchlistRepo.applyImportPreview(input as ImportPreview));
  handle("watchlist:exportJson", async (input) => {
    await context.exportService.exportJson((input as { path: string }).path);
  });

  handle("market:getQuotes", async (input) => {
    const typed = input as { symbols: Array<`${string}.${"SH" | "SZ" | "BJ"}`> };
    const liveBySymbol = new Map<string, unknown>();
    try {
      const live = await context.dataServiceClient.getQuotes(typed.symbols);
      for (const quote of live) {
        const withSource = {
          ...quote,
          dataSource: "live" as const
        };
        liveBySymbol.set(quote.symbol, withSource);
        context.cacheRepo.setQuote(quote.symbol, JSON.stringify(withSource));
      }
    } catch (error) {
      console.warn(`[market:getQuotes] live fetch failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    const merged = typed.symbols
      .map((symbol) => {
        const live = liveBySymbol.get(symbol);
        if (live) {
          return live;
        }
        const cached = parseCachedJson<Record<string, unknown>>(context.cacheRepo.getQuote(symbol)?.payload);
        if (!cached) {
          return null;
        }
        return {
          ...cached,
          dataSource: "cache" as const
        };
      })
      .filter((item): item is object => Boolean(item)) as QuoteSnapshot[];
    void context.alertService.evaluateQuotes(merged);
    return merged;
  });

  handle("market:getKline", async (input) => {
    const typed = input as Parameters<AppContext["dataServiceClient"]["getKline"]>[0];
    const cacheKey = buildKlineCacheKey(typed);
    let result: Awaited<ReturnType<AppContext["dataServiceClient"]["getKline"]>> | null = null;

    try {
      const live = await context.dataServiceClient.getKline(typed);
      if (live.bars.length > 0) {
        context.cacheRepo.setKline(cacheKey, JSON.stringify(live));
        result = live;
      } else {
        result = parseCachedJson<Awaited<ReturnType<AppContext["dataServiceClient"]["getKline"]>>>(context.cacheRepo.getKline(cacheKey)?.payload) ?? live;
      }
    } catch (error) {
      console.warn(`[market:getKline] live fetch failed: ${error instanceof Error ? error.message : String(error)}`);
      result = parseCachedJson<Awaited<ReturnType<AppContext["dataServiceClient"]["getKline"]>>>(context.cacheRepo.getKline(cacheKey)?.payload);
    }

    const fallback = result ?? {
      symbol: typed.symbol,
      timeframe: typed.timeframe,
      adjustMode: typed.adjustMode,
      bars: [],
      updatedAt: new Date().toISOString()
    };
    return {
      ...fallback,
      indicators: attachIndicators(fallback.bars)
    };
  });

  handle("market:getNews", async (input) => {
    const typed = input as { symbol: `${string}.${"SH" | "SZ" | "BJ"}`; start?: string; end?: string; limit?: number };
    const cacheKey = buildNewsCacheKey(typed.symbol, typed);
    try {
      const live = await context.dataServiceClient.getNews(typed.symbol, typed);
      if (live.length > 0) {
        context.cacheRepo.setNews(cacheKey, JSON.stringify(live));
        return live;
      }
    } catch (error) {
      console.warn(`[market:getNews] live fetch failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    return parseCachedJson<unknown[]>(context.cacheRepo.getNews(cacheKey)?.payload) ?? [];
  });

  handle("market:getEvents", async (input) => {
    const typed = input as { symbol: `${string}.${"SH" | "SZ" | "BJ"}`; start?: string; end?: string; limit?: number };
    const cacheKey = buildNewsCacheKey(`events:${typed.symbol}`, typed);
    try {
      const live = await context.dataServiceClient.getEvents(typed.symbol, typed);
      if (live.length > 0) {
        context.cacheRepo.setEvents(cacheKey, JSON.stringify(live));
        return live;
      }
    } catch (error) {
      console.warn(`[market:getEvents] live fetch failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    return parseCachedJson<unknown[]>(context.cacheRepo.getEvents(cacheKey)?.payload) ?? [];
  });
  handle("market:getFundamentals", async (input) => {
    const typed = input as { symbol: `${string}.${"SH" | "SZ" | "BJ"}` };
    return context.dataServiceClient.getFundamentals(typed.symbol);
  });

  handle("analysis:run", async (input) => context.analysisService.enqueue(input as Parameters<AppContext["analysisService"]["enqueue"]>[0]));
  handle("analysis:listRuns", async (input) =>
    context.analysisRepo.listRuns(input as { symbol?: string; start?: string; end?: string } | undefined)
  );
  handle("analysis:getRun", async (input) => {
    const run = context.analysisRepo.getRun((input as { id: string }).id);
    if (!run) {
      throw new Error("Analysis run not found.");
    }
    return run;
  });
  handle("analysis:getQueueStatus", async () => context.analysisService.getQueueStatus());
  handle("analysis:exportRuns", async (input) => {
    const typed = input as { path: string; format: "markdown" | "pdf"; runIds: string[] };
    return context.exportService.exportAnalysisRuns(typed);
  });
  handle("alerts:listRules", async (input) => context.alertService.listRules((input as { symbol?: string } | undefined)?.symbol));
  handle("alerts:saveRule", async (input) => context.alertService.saveRule(input as Parameters<AppContext["alertService"]["saveRule"]>[0]));
  handle("alerts:deleteRule", async (input) => {
    context.alertService.deleteRule((input as { id: string }).id);
  });
  handle("alerts:listEvents", async (input) =>
    context.alertService.listEvents(input as { symbol?: string; limit?: number } | undefined)
  );
  handle("alerts:markEventRead", async (input) => {
    context.alertService.markEventRead((input as { id: string }).id);
  });
  handle("alerts:evaluate", async (input) => context.alertService.evaluate(input as { symbol?: string } | undefined));

  handle("settings:get", async () => context.settingsRepo.getSettings());
  handle("settings:save", async (input) => {
    const parsed = saveSettingsInputSchema.parse(input);
    for (const profile of parsed.llmProfiles) {
      if (profile.apiKey) {
        await context.secretManager.set(profile.id, profile.apiKey);
      }
    }
    return context.settingsRepo.saveSettings(parsed);
  });
  handle("settings:testDataSource", async () => {
    try {
      const health = await context.dataServiceClient.getHealth();
      const ok = Boolean(health.ok);
      const providerName = health.providerName ?? health.providerId ?? "unknown";
      const market = health.market ?? "CN_A";
      return {
        ok,
        message: ok
          ? `Data source connected: ${providerName} (${market}).`
          : "Data source health check failed.",
        details: {
          providerId: health.providerId ?? null,
          providerName: health.providerName ?? null,
          providerRepo: health.providerRepo ?? null,
          market,
          quoteSource: health.quoteSource ?? null,
          klineSource: health.klineSource ?? null,
          newsSource: health.newsSource ?? null
        }
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Data source health check failed."
      };
    }
  });
  handle("settings:testLlmProfile", async (input) => {
    const settings = context.settingsRepo.getSettings();
    const profileId = (input as { profileId: string }).profileId;
    const profile = settings?.llmProfiles.find((item) => item.id === profileId);
    if (!profile) {
      return { ok: false, message: "Profile not found." };
    }

    try {
      await context.analysisService.testProfile(profile);
      return { ok: true, message: "LLM profile connected successfully." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Unknown error." };
    }
  });
  handle("settings:clearSecrets", async (input) => {
    await context.secretManager.clear((input as { profileId: string }).profileId);
  });

  handle("system:openExternal", async (input) => {
    const url = new URL((input as { url: string }).url);
    if (!["https:"].includes(url.protocol)) {
      throw new Error("Only https URLs are allowed.");
    }
    await shell.openExternal(url.toString());
  });
  handle("system:pickImportFile", async () => {
    const selected = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "CSV", extensions: ["csv"] }]
    });
    return selected.canceled ? null : selected.filePaths[0];
  });
  handle("system:pickExportPath", async (input) => {
    const kind = (input as { kind: "json" | "markdown" | "pdf" }).kind;
    const extension = kind === "markdown" ? "md" : kind === "pdf" ? "pdf" : "json";
    const filterName = kind === "markdown" ? "Markdown" : kind === "pdf" ? "PDF" : "JSON";
    const selected = await dialog.showSaveDialog({
      defaultPath: path.join(context.userDataDir, `stockdesk-export.${extension}`),
      filters: [{ name: filterName, extensions: [extension] }]
    });
    return selected.canceled ? null : selected.filePath ?? null;
  });
  handle("system:clearCache", async () => {
    context.cacheRepo.clear();
  });
}
