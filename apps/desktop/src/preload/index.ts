import { contextBridge, ipcRenderer } from "electron";
import type { IpcChannel, IpcInput, IpcOutput } from "@stockdesk/shared";

async function invoke<TChannel extends IpcChannel>(channel: TChannel, input: IpcInput<TChannel>): Promise<IpcOutput<TChannel>> {
  return ipcRenderer.invoke(channel, input) as Promise<IpcOutput<TChannel>>;
}

contextBridge.exposeInMainWorld("stockdesk", {
  bootstrap: {
    get: () => invoke("bootstrap:get", undefined)
  },
  watchlist: {
    listGroups: () => invoke("watchlist:listGroups", undefined),
    saveGroup: (input: IpcInput<"watchlist:saveGroup">) => invoke("watchlist:saveGroup", input),
    deleteGroup: (id: string) => invoke("watchlist:deleteGroup", { id }),
    listItems: (groupId?: string | null) => invoke("watchlist:listItems", groupId ? { groupId } : undefined),
    addSymbols: (input: IpcInput<"watchlist:addSymbols">) => invoke("watchlist:addSymbols", input),
    removeItems: (ids: string[]) => invoke("watchlist:removeItems", { ids }),
    importCsv: (path: string) => invoke("watchlist:importCsv", { path }),
    applyImportPreview: (preview: IpcInput<"watchlist:applyImportPreview">) => invoke("watchlist:applyImportPreview", preview),
    exportJson: (path: string) => invoke("watchlist:exportJson", { path })
  },
  market: {
    getQuotes: (symbols: string[]) => invoke("market:getQuotes", { symbols }),
    getKline: (input: IpcInput<"market:getKline">) => invoke("market:getKline", input),
    getNews: (input: IpcInput<"market:getNews">) => invoke("market:getNews", input),
    getEvents: (input: IpcInput<"market:getEvents">) => invoke("market:getEvents", input),
    getFundamentals: (symbol: string) => invoke("market:getFundamentals", { symbol }),
    getSymbolProfile: (symbol: string) => invoke("market:getSymbolProfile", { symbol }),
    getSymbolLinkage: (symbol: string) => invoke("market:getSymbolLinkage", { symbol })
  },
  analysis: {
    run: (input: IpcInput<"analysis:run">) => invoke("analysis:run", input),
    startTask: (input: IpcInput<"analysis:startTask">) => invoke("analysis:startTask", input),
    listRuns: (filter?: IpcInput<"analysis:listRuns">) => invoke("analysis:listRuns", filter),
    listTasks: (filter?: IpcInput<"analysis:listTasks">) => invoke("analysis:listTasks", filter),
    getTask: (id: string) => invoke("analysis:getTask", { id }),
    getTaskStages: (taskId: string) => invoke("analysis:getTaskStages", { taskId }),
    cancelTask: (id: string) => invoke("analysis:cancelTask", { id }),
    getRun: (id: string) => invoke("analysis:getRun", { id }),
    getQueueStatus: () => invoke("analysis:getQueueStatus", undefined),
    exportRuns: (input: IpcInput<"analysis:exportRuns">) => invoke("analysis:exportRuns", input)
  },
  alerts: {
    listRules: (filter?: IpcInput<"alerts:listRules">) => invoke("alerts:listRules", filter),
    saveRule: (input: IpcInput<"alerts:saveRule">) => invoke("alerts:saveRule", input),
    deleteRule: (id: string) => invoke("alerts:deleteRule", { id }),
    listEvents: (filter?: IpcInput<"alerts:listEvents">) => invoke("alerts:listEvents", filter),
    markEventRead: (id: string) => invoke("alerts:markEventRead", { id }),
    evaluate: (symbol?: string) => invoke("alerts:evaluate", symbol ? { symbol } : undefined)
  },
  settings: {
    get: () => invoke("settings:get", undefined),
    save: (input: IpcInput<"settings:save">) => invoke("settings:save", input),
    testDataSource: (profileId?: string) => invoke("settings:testDataSource", profileId ? { profileId } : undefined),
    testLlmProfile: (
      profileId: string,
      draft?: IpcInput<"settings:testLlmProfile">["draft"],
      probeMode?: IpcInput<"settings:testLlmProfile">["probeMode"]
    ) => invoke("settings:testLlmProfile", { profileId, draft, probeMode }),
    clearSecrets: (profileId: string) => invoke("settings:clearSecrets", { profileId })
  },
  system: {
    openExternal: (url: string) => invoke("system:openExternal", { url }),
    pickImportFile: () => invoke("system:pickImportFile", undefined),
    pickExportPath: (kind: "json" | "markdown" | "pdf") => invoke("system:pickExportPath", { kind }),
    clearCache: () => invoke("system:clearCache", undefined)
  }
});

declare global {
  interface Window {
    stockdesk: {
      bootstrap: { get(): Promise<IpcOutput<"bootstrap:get">> };
      watchlist: {
        listGroups(): Promise<IpcOutput<"watchlist:listGroups">>;
        saveGroup(input: IpcInput<"watchlist:saveGroup">): Promise<IpcOutput<"watchlist:saveGroup">>;
        deleteGroup(id: string): Promise<void>;
        listItems(groupId?: string | null): Promise<IpcOutput<"watchlist:listItems">>;
        addSymbols(input: IpcInput<"watchlist:addSymbols">): Promise<IpcOutput<"watchlist:addSymbols">>;
        removeItems(ids: string[]): Promise<void>;
        importCsv(path: string): Promise<IpcOutput<"watchlist:importCsv">>;
        applyImportPreview(preview: IpcInput<"watchlist:applyImportPreview">): Promise<IpcOutput<"watchlist:applyImportPreview">>;
        exportJson(path: string): Promise<void>;
      };
      market: {
        getQuotes(symbols: string[]): Promise<IpcOutput<"market:getQuotes">>;
        getKline(input: IpcInput<"market:getKline">): Promise<IpcOutput<"market:getKline">>;
        getNews(input: IpcInput<"market:getNews">): Promise<IpcOutput<"market:getNews">>;
        getEvents(input: IpcInput<"market:getEvents">): Promise<IpcOutput<"market:getEvents">>;
        getFundamentals(symbol: string): Promise<IpcOutput<"market:getFundamentals">>;
        getSymbolProfile(symbol: string): Promise<IpcOutput<"market:getSymbolProfile">>;
        getSymbolLinkage(symbol: string): Promise<IpcOutput<"market:getSymbolLinkage">>;
      };
      analysis: {
        run(input: IpcInput<"analysis:run">): Promise<IpcOutput<"analysis:run">>;
        startTask(input: IpcInput<"analysis:startTask">): Promise<IpcOutput<"analysis:startTask">>;
        listRuns(filter?: IpcInput<"analysis:listRuns">): Promise<IpcOutput<"analysis:listRuns">>;
        listTasks(filter?: IpcInput<"analysis:listTasks">): Promise<IpcOutput<"analysis:listTasks">>;
        getTask(id: string): Promise<IpcOutput<"analysis:getTask">>;
        getTaskStages(taskId: string): Promise<IpcOutput<"analysis:getTaskStages">>;
        cancelTask(id: string): Promise<IpcOutput<"analysis:cancelTask">>;
        getRun(id: string): Promise<IpcOutput<"analysis:getRun">>;
        getQueueStatus(): Promise<IpcOutput<"analysis:getQueueStatus">>;
        exportRuns(input: IpcInput<"analysis:exportRuns">): Promise<IpcOutput<"analysis:exportRuns">>;
      };
      alerts: {
        listRules(filter?: IpcInput<"alerts:listRules">): Promise<IpcOutput<"alerts:listRules">>;
        saveRule(input: IpcInput<"alerts:saveRule">): Promise<IpcOutput<"alerts:saveRule">>;
        deleteRule(id: string): Promise<void>;
        listEvents(filter?: IpcInput<"alerts:listEvents">): Promise<IpcOutput<"alerts:listEvents">>;
        markEventRead(id: string): Promise<void>;
        evaluate(symbol?: string): Promise<IpcOutput<"alerts:evaluate">>;
      };
      settings: {
        get(): Promise<IpcOutput<"settings:get">>;
        save(input: IpcInput<"settings:save">): Promise<IpcOutput<"settings:save">>;
        testDataSource(profileId?: string): Promise<IpcOutput<"settings:testDataSource">>;
        testLlmProfile(
          profileId: string,
          draft?: IpcInput<"settings:testLlmProfile">["draft"],
          probeMode?: IpcInput<"settings:testLlmProfile">["probeMode"]
        ): Promise<IpcOutput<"settings:testLlmProfile">>;
        clearSecrets(profileId: string): Promise<void>;
      };
      system: {
        openExternal(url: string): Promise<void>;
        pickImportFile(): Promise<string | null>;
        pickExportPath(kind: "json" | "markdown" | "pdf"): Promise<string | null>;
        clearCache(): Promise<void>;
      };
    };
  }
}
