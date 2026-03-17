# 架构说明

## 1. 总体结构

项目采用 monorepo 组织，核心由 4 层组成：

1. `apps/desktop`
   Electron 主进程、preload、renderer UI。
2. `apps/data-service`
   本地 FastAPI 服务，负责行情、K 线、新闻、事件、财务和个股联动数据。
3. `packages/db`
   SQLite schema 与 repository，负责本地持久化。
4. `packages/analysis-core`
   指标计算、特征工程、提示词模板。

## 2. 运行时数据流

### 桌面端启动

1. Electron 主进程启动。
2. `createAppContext()` 初始化 SQLite。
3. 主进程通过 `DataServiceManager` 拉起本地 Python 服务。
4. 主进程注册 IPC。
5. Renderer 通过 preload 暴露的 `window.stockdesk.*` 调用主进程能力。

### 市场数据流

1. Renderer 发起 `market:*` 请求。
2. 主进程通过 `DataServiceClient` 请求本地 FastAPI 服务。
3. 主进程根据场景写入缓存仓库。
4. Renderer 展示实时或缓存结果。

### 分析任务流

1. Renderer 手动点击分析按钮。
2. 主进程 `AnalysisService.startTask()` 创建持久化任务并入队。
3. 队列串行执行固定 8 个 stage。
4. Host stage 拉取研究上下文，LLM stage 产出结构化 JSON。
5. 每个 stage 的输入、输出、状态和错误都会持久化。
6. 最终报告写入 `analysis_runs`，阶段轨迹写入 `analysis_stage_runs`。
7. Renderer 通过个股详情页和历史页展示任务、阶段时间线和最终报告。

## 3. 桌面端模块

### 主进程

- `appContext.ts`
  初始化数据库、数据服务、分析/提醒/export 服务。
- `ipc/registerHandlers.ts`
  所有 renderer 能力入口。
- `services/dataServiceManager.ts`
  本地 Python 服务生命周期管理。
- `services/dataServiceClient.ts`
  FastAPI 客户端。
- `services/analysisService.ts`
  固定阶段任务流、队列、stage trace 持久化。
- `services/llmClient.ts`
  统一 LLM 编排层、JSON 提取、schema 校验与 repair pass。
- `services/llmProtocolAdapters.ts`
  多协议 LLM adapter registry。

### Renderer

- `ShellLayout`
  桌面工作台外壳。
- `WatchlistPage`
  自选总览与批量分析入口。
- `SymbolDetailPage`
  三栏个股研究终端。
- `HistoryPage`
  分析档案与导出。
- `SettingsPage`
  系统状态、LLM 状态、缓存与密钥控制。

## 4. Python 数据服务

当前 provider 为 `AkshareProvider`，主要组合了：

- `AKShare`
- `Sina`
- `Eastmoney`

### 当前接口

- `/health`
- `/symbols/search`
- `/quotes/realtime`
- `/klines/{symbol}`
- `/news/{symbol}`
- `/events/{symbol}`
- `/fundamentals/{symbol}`
- `/profile/{symbol}`
- `/linkage/{symbol}`
- `/calendar/trading-days`

## 5. 持久化

SQLite 目前主要保存：

- 自选分组与条目
- 设置与 LLM profile
- 行情缓存、K 线缓存、新闻缓存、事件缓存
- 分析任务、阶段轨迹、最终报告与 artifact
- 提醒规则与提醒事件

## 6. 当前设计特点

- 桌面端是“本地优先”架构
- LLM 结果必须落成结构化 JSON，便于 UI 渲染
- 分析任务是持久化任务，不是临时聊天消息
- LLM 协议层已经抽象成多 provider adapter
- 分析流已经升级为固定阶段 workflow
- UI 已经转向 Fluent + Windows 风格壳层

## 7. 当前主要限制

- 当前 workflow 仍是固定阶段，不支持动态图或模型自主演化分支
- 数据源抽象还不够强，当前 provider 偏向免费/开源可用性
- 个股联动中的概念板块查询仍然偏重，后续需要缓存或预索引
