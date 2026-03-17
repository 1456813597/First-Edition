# StockDesk

StockDesk 是一个面向 Windows 桌面场景的 A 股监控与 AI 研究终端。  
当前仓库包含 Electron 桌面端、本地 FastAPI 数据服务、SQLite 持久层，以及面向结构化研究报告的分析核心。

## 当前能力

- 自选股分组、导入、导出、实时/缓存行情展示
- 个股详情页三栏研究终端
  - 公司概览
  - 行业/概念/指数联动
  - K 线图表
  - 新闻、事件、财务、提醒
  - 持久化 AI 分析记录
- 本地数据服务
  - A 股行情
  - K 线
  - 新闻与事件
  - 财务/估值
  - 个股资料与板块联动
- 本地 SQLite 持久化
  - 自选
  - 设置
  - 分析任务、阶段轨迹、最终报告
  - 提醒规则与触发记录

## 当前边界

- 数据源目前以 `AKShare + Sina/Eastmoney` 为主，适合免费/开源路线，但还不是严格生产级行情基础设施。
- 桌面端目前绑定的是内嵌本地数据服务，设置页中的 provider 信息是“当前实际绑定状态”，不是远程数据源切换面板。
- LLM 已支持多协议适配与结构化 JSON 校验，但首期 workflow 仍是固定阶段，不是动态图 agent graph。
- 全量自动化测试在非目标环境下可能被 `better-sqlite3` 原生绑定阻塞。

## 仓库结构

- `apps/desktop`: Electron + React 桌面端
- `apps/data-service`: FastAPI 本地数据服务与 keyring CLI
- `packages/shared`: 共享类型、schema、IPC 合约
- `packages/analysis-core`: 特征工程、指标、提示词模板
- `packages/db`: SQLite schema 与 repository
- `packages/fixtures`: 样例数据

## 文档导航

- [Windows 开发运行说明](./docs/RUN_ELECTRON_DEV_WINDOWS.md)
- [架构说明](./docs/ARCHITECTURE.md)
- [LLM 协议说明](./docs/LLM_PROTOCOLS.md)
- [Agent Workflow 说明](./docs/AGENT_WORKFLOW.md)
- [开发与验证说明](./docs/DEVELOPMENT.md)
- [审查与重构清单](./docs/REVIEW_BACKLOG.md)

## 快速开始

### Windows 目标环境

1. 使用仓库内置 Node 22。
2. 在 `apps/data-service` 下执行 `uv sync`。
3. 在项目根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -Command "& '.\scripts\pnpm-node22.ps1' install"
powershell -ExecutionPolicy Bypass -Command "& '.\scripts\pnpm-node22.ps1' --filter @stockdesk/desktop dev"
```

### 非 Windows 环境

非 Windows 机器更适合做静态审查和类型检查，不建议作为最终打包环境。

```bash
npx pnpm@10.16.1 install
npx pnpm@10.16.1 typecheck
```

## 本地工具链

- 仓库内置了 Windows 版 `Node 22.22.0`，位于 `tools/node22`
- Windows 下推荐通过 `scripts/pnpm-node22.ps1` 调用 `pnpm`
- Python 数据服务目标版本为 `3.13+`

## 运行说明

- 桌面端会在主进程启动时拉起本地数据服务
- LLM API Key 通过系统 keyring 保存，不再缓存到 renderer `localStorage`
- 分析任务由主进程队列串行执行，任务、阶段轨迹和最终报告都会持久化到本地数据库

## 验证建议

建议至少执行以下检查：

```bash
npx pnpm@10.16.1 typecheck
npx pnpm@10.16.1 --filter @stockdesk/shared test
npx pnpm@10.16.1 --filter @stockdesk/analysis-core test
```

如果要跑 `packages/db` 或完整桌面端联调，请优先在目标 Windows Node 22 环境下进行。
