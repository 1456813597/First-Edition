import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function isElectronViteDev() {
  return process.env.NODE_ENV_ELECTRON_VITE === "development" || Boolean(process.env.ELECTRON_RENDERER_URL);
}

export class SecretManager {
  constructor(private readonly options: { serviceRoot: string }) {}

  private resolveCommand() {
    const isPackaged = !isElectronViteDev();
    if (isPackaged) {
      return {
        command: path.join(process.resourcesPath, "python-service", "stockdesk-secret.exe"),
        argsPrefix: []
      };
    }

    return {
      command: path.join(this.options.serviceRoot, ".venv", "Scripts", "python.exe"),
      argsPrefix: ["-m", "stockdesk_service.secret_cli"],
      cwd: this.options.serviceRoot,
      env: {
        ...process.env,
        PYTHONPATH: path.join(this.options.serviceRoot, "src")
      }
    };
  }

  async set(profileId: string, apiKey: string) {
    const config = this.resolveCommand();
    await execFileAsync(config.command, [...config.argsPrefix, "set", profileId, apiKey], {
      cwd: config.cwd,
      env: config.env
    });
  }

  async get(profileId: string): Promise<string | null> {
    const config = this.resolveCommand();
    try {
      const { stdout } = await execFileAsync(config.command, [...config.argsPrefix, "get", profileId], {
        cwd: config.cwd,
        env: config.env
      });
      const trimmed = stdout.trim();
      return trimmed.length > 0 ? trimmed : null;
    } catch {
      return null;
    }
  }

  async clear(profileId: string) {
    const config = this.resolveCommand();
    await execFileAsync(config.command, [...config.argsPrefix, "delete", profileId], {
      cwd: config.cwd,
      env: config.env
    });
  }
}
