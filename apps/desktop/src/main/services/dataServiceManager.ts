import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isElectronViteDev() {
  return process.env.NODE_ENV_ELECTRON_VITE === "development" || Boolean(process.env.ELECTRON_RENDERER_URL);
}

function printServiceLogs(chunk: unknown, stream: "stdout" | "stderr") {
  const text = String(chunk);
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().length === 0) {
      continue;
    }
    const prefix = stream === "stderr" ? "[data-service:err]" : "[data-service]";
    if (stream === "stderr") {
      console.error(`${prefix} ${line}`);
    } else {
      console.log(`${prefix} ${line}`);
    }
  }
}

export class DataServiceManager {
  readonly port: number;
  readonly baseUrl: string;
  private child: ChildProcessWithoutNullStreams | null = null;

  constructor(
    private readonly options: {
      serviceRoot: string;
      userDataDir: string;
    }
  ) {
    this.port = 18765;
    this.baseUrl = `http://127.0.0.1:${this.port}`;
  }

  async start() {
    if (this.child) {
      return;
    }

    const isDev = isElectronViteDev();
    const isPackaged = !isDev;
    if (isPackaged) {
      const exePath = path.join(process.resourcesPath, "python-service", "stockdesk-service.exe");
      this.child = spawn(exePath, [], {
        env: {
          ...process.env,
          STOCKDESK_PORT: String(this.port),
          STOCKDESK_USER_DATA: this.options.userDataDir
        },
        stdio: "pipe"
      });
    } else {
      const serviceRoot = this.options.serviceRoot;
      if (isDev) {
        console.log(`[data-service] using serviceRoot: ${serviceRoot}`);
      }
      const venvPython = path.join(serviceRoot, ".venv", "Scripts", "python.exe");
      this.child = spawn(
        venvPython,
        ["-m", "uvicorn", "stockdesk_service.app:app", "--host", "127.0.0.1", "--port", String(this.port)],
        {
          cwd: serviceRoot,
          env: {
            ...process.env,
            PYTHONPATH: path.join(serviceRoot, "src"),
            STOCKDESK_PORT: String(this.port),
            STOCKDESK_USER_DATA: this.options.userDataDir
          },
          stdio: "pipe"
        }
      );
    }

    if (isDev) {
      this.child.stdout.on("data", (chunk) => printServiceLogs(chunk, "stdout"));
      this.child.stderr.on("data", (chunk) => printServiceLogs(chunk, "stderr"));
      this.child.on("exit", (code, signal) => {
        console.warn(`[data-service] exited code=${code ?? "null"} signal=${signal ?? "null"}`);
      });
      this.child.on("error", (error) => {
        console.error(`[data-service] spawn error: ${error.message}`);
      });
    } else {
      this.child.stdout.on("data", () => void 0);
      this.child.stderr.on("data", () => void 0);
    }
    await this.waitUntilHealthy();
  }

  async stop() {
    this.child?.kill();
    this.child = null;
  }

  private async waitUntilHealthy() {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        const response = await fetch(`${this.baseUrl}/health`);
        if (response.ok) {
          return;
        }
      } catch {
        await delay(1000);
      }
    }

    throw new Error("Local data service did not become healthy in time.");
  }
}
