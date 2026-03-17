import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { app } from "electron";
import { createDatabase, AlertRepo, AnalysisRepo, AnalysisTaskRepo, CacheRepo, SettingsRepo, WatchlistRepo } from "@stockdesk/db";
import { AlertService } from "./services/alertService";
import { AnalysisService } from "./services/analysisService";
import { DataServiceClient } from "./services/dataServiceClient";
import { DataServiceManager } from "./services/dataServiceManager";
import { ExportService } from "./services/exportService";
import { SecretManager } from "./services/secretManager";

export interface AppContext {
  userDataDir: string;
  dataServiceManager: DataServiceManager;
  dataServiceClient: DataServiceClient;
  watchlistRepo: WatchlistRepo;
  settingsRepo: SettingsRepo;
  cacheRepo: CacheRepo;
  analysisRepo: AnalysisRepo;
  analysisTaskRepo: AnalysisTaskRepo;
  alertRepo: AlertRepo;
  secretManager: SecretManager;
  analysisService: AnalysisService;
  alertService: AlertService;
  exportService: ExportService;
}

function resolveDataServiceRoot() {
  const candidates = [
    process.env.STOCKDESK_DATA_SERVICE_ROOT,
    path.join(process.cwd(), "apps", "data-service"),
    path.join(process.cwd(), "data-service"),
    path.join(app.getAppPath(), "..", "data-service"),
    path.join(app.getAppPath(), "..", "..", "data-service"),
    path.join(path.resolve(__dirname, "../../../.."), "apps", "data-service"),
    path.join(path.resolve(__dirname, "../../../.."), "data-service")
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => path.resolve(value));

  const dataServiceRoot = [...new Set(candidates)].find((candidate) =>
    existsSync(path.join(candidate, "src", "stockdesk_service", "app.py"))
  );
  if (!dataServiceRoot) {
    throw new Error("Unable to locate data-service directory. Set STOCKDESK_DATA_SERVICE_ROOT to continue.");
  }
  return dataServiceRoot;
}

export async function createAppContext(): Promise<AppContext> {
  const userDataDir = app.getPath("userData");
  mkdirSync(userDataDir, { recursive: true });
  const dbPath = path.join(userDataDir, "stockdesk.db");
  const { db } = createDatabase(dbPath);
  const dataServiceRoot = app.isPackaged ? process.resourcesPath : resolveDataServiceRoot();

  const dataServiceManager = new DataServiceManager({
    serviceRoot: dataServiceRoot,
    userDataDir
  });
  await dataServiceManager.start();

  const dataServiceClient = new DataServiceClient(dataServiceManager.baseUrl);
  const watchlistRepo = new WatchlistRepo(db);
  const settingsRepo = new SettingsRepo(db);
  const cacheRepo = new CacheRepo(db);
  const analysisRepo = new AnalysisRepo(db);
  const analysisTaskRepo = new AnalysisTaskRepo(db);
  const alertRepo = new AlertRepo(db);
  const secretManager = new SecretManager({
    serviceRoot: dataServiceRoot
  });
  const analysisService = new AnalysisService({
    dataServiceClient,
    settingsRepo,
    analysisRepo,
    analysisTaskRepo,
    secretManager
  });
  const alertService = new AlertService({
    alertRepo,
    dataServiceClient
  });
  const exportService = new ExportService({
    settingsRepo,
    watchlistRepo,
    analysisRepo
  });

  return {
    userDataDir,
    dataServiceManager,
    dataServiceClient,
    watchlistRepo,
    settingsRepo,
    cacheRepo,
    analysisRepo,
    analysisTaskRepo,
    alertRepo,
    secretManager,
    analysisService,
    alertService,
    exportService
  };
}
