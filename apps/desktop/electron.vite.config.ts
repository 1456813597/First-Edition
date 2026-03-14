import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  main: {
    clearScreen: false,
    build: {
      rollupOptions: {
        external: ["better-sqlite3"]
      }
    },
    resolve: {
      alias: {
        "@stockdesk/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
        "@stockdesk/analysis-core": path.resolve(__dirname, "../../packages/analysis-core/src/index.ts"),
        "@stockdesk/db": path.resolve(__dirname, "../../packages/db/src/index.ts")
      }
    }
  },
  preload: {
    clearScreen: false,
    resolve: {
      alias: {
        "@stockdesk/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts")
      }
    }
  },
  renderer: {
    clearScreen: false,
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src/renderer/src"),
        "@stockdesk/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
        "@stockdesk/analysis-core": path.resolve(__dirname, "../../packages/analysis-core/src/index.ts")
      }
    },
    plugins: [react()]
  }
});
