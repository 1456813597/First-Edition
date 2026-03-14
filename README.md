# StockDesk

Electron local Windows client for A-share monitoring and LLM-assisted analysis.

## Workspace

- `apps/desktop`: Electron + React desktop app
- `apps/data-service`: FastAPI local market data service + secret CLI
- `packages/shared`: shared types, schemas, IPC contracts
- `packages/analysis-core`: indicators, feature building, prompt templates
- `packages/db`: SQLite schema and repositories
- `packages/fixtures`: mock fixtures for tests

## Local Tooling

- The repo includes a local `Node 22.22.0` runtime in `tools/node22` because `better-sqlite3` does not currently provide a prebuilt binary for the system `Node 24.x` on this machine.
- Use `./scripts/pnpm-node22.ps1 install`, `./scripts/pnpm-node22.ps1 typecheck`, and `./scripts/pnpm-node22.ps1 test` to run workspace commands against the pinned Node 22 runtime.
- Python dependencies for the data service live in `apps/data-service/.venv`.
