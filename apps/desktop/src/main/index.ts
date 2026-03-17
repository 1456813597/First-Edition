import { app, BrowserWindow } from "electron";
import path from "node:path";
import { createAppContext } from "./appContext";
import { registerHandlers } from "./ipc/registerHandlers";

let mainWindow: BrowserWindow | null = null;

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1200,
    minHeight: 800,
    backgroundColor: "#0b1020",
    titleBarStyle: process.platform === "win32" ? "hidden" : "default",
    titleBarOverlay: process.platform === "win32"
      ? {
          color: "#0f172a",
          symbolColor: "#f8fafc",
          height: 40
        }
      : false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    await mainWindow.loadURL(rendererUrl);
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  if (process.platform === "win32") {
    (
      mainWindow as BrowserWindow & {
        setBackgroundMaterial?: (material: "auto" | "none" | "mica" | "acrylic" | "tabbed") => void;
      }
    ).setBackgroundMaterial?.("mica");
  }
}

app.whenReady().then(async () => {
  const context = await createAppContext();
  registerHandlers(context);
  await createMainWindow();

  app.on("before-quit", async () => {
    await context.dataServiceManager.stop();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
