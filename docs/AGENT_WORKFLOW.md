# 股票分析 Agent Workflow

## 目标

分析系统已经从“单次直接出报告”升级为“后台持久化任务 + 固定阶段 workflow”。

当前核心实现位于：

- `apps/desktop/src/main/services/analysisService.ts`
- `packages/shared/src/types/analysis.ts`
- `packages/shared/src/schemas/analysis.ts`
- `packages/db/src/repos/analysisTaskRepo.ts`

## 核心模型

### 任务

`analysis_tasks` 负责保存任务生命周期：

- `id`
- `symbol`
- `workflowId`
- `templateId`
- `llmProfileId`
- `protocol`
- `status`
- `createdAt`
- `startedAt`
- `completedAt`
- `failedAt`
- `errorSummary`
- `finalRunId`
- `currentStageKey`
- `currentStageStatus`

### 阶段运行记录

`analysis_stage_runs` 负责保存每个 stage 的轨迹：

- `id`
- `taskId`
- `stageKey`
- `stageOrder`
- `actorKind`
- `status`
- `model`
- `title`
- `summary`
- `startedAt`
- `completedAt`
- `structuredInput`
- `structuredOutput`
- `rawPayloadRef`
- `usage`
- `errorSummary`

### 最终报告

`analysis_runs` 继续作为最终落库报告表，只保存成功完成后的最终研究结果。

## 固定阶段

当前 workflow id：

- `stock_research_v1`

固定阶段如下：

1. `snapshot_collect`
   Host stage，拉取 quote、K 线、新闻、事件、财务、个股资料、板块联动、指数联动、交易日日历，生成标准化 research context。
2. `research_plan`
   LLM stage，输出研究计划 JSON。
3. `evidence_expand`
   Host stage，按研究计划补充有限扩展证据。
4. `technical_analysis`
   LLM stage，输出技术面和市场结构分析 JSON。
5. `fundamental_event_analysis`
   LLM stage，输出财务、新闻、事件、行业联动分析 JSON。
6. `risk_challenge`
   LLM stage，从反方视角修正结论与置信度。
7. `final_report`
   LLM stage，产出 `analysis_report_v2`。
8. `validate_and_persist`
   Host stage，校验最终 schema，写入 `analysis_runs` 与 artifact。

## 状态机

### 任务状态

- `pending`
- `running`
- `completed`
- `failed`
- `cancelled`

### 阶段状态

- `pending`
- `running`
- `completed`
- `failed`
- `cancelled`

首期规则：

- 单 worker 串行执行
- 失败即终止，不跳过后续阶段
- 只允许取消尚未开始的 pending 任务

## IPC 接口

当前前端使用的任务接口：

- `analysis:startTask`
- `analysis:listTasks`
- `analysis:getTask`
- `analysis:getTaskStages`
- `analysis:cancelTask`
- `analysis:getRun`

兼容接口：

- `analysis:run`

说明：

- `analysis:run` 仍保留为 shim，用于旧代码路径等待最终完成结果
- 新 UI 应优先使用 `analysis:startTask`

## 最终报告 schema

当前最终报告为 `analysis_report_v2`，核心字段包括：

- `schemaVersion`
- `symbol`
- `asOf`
- `forecastWindow`
- `marketRegime`
- `stance`
- `confidence`
- `summary`
- `technicalView`
- `fundamentalView`
- `newsEventView`
- `sectorIndexLinkage`
- `scenarioTree`
- `riskMatrix`
- `invalidationSignals`
- `actionPlan`
- `evidence`
- `dataQuality`
- `disclaimer`

报告设计原则：

- 所有 UI 都优先使用结构化字段渲染
- 不依赖原始自然语言长文本
- 强制包含反证条件与风险矩阵
- 强制输出“不构成投资建议”

## Prompt 设计

提示词已经按阶段拆分，位于 `packages/analysis-core/src/prompts/templates.ts`：

- `buildResearchPlanSystemPrompt`
- `buildResearchPlanUserPrompt`
- `buildTechnicalAnalysisSystemPrompt`
- `buildTechnicalAnalysisUserPrompt`
- `buildFundamentalEventSystemPrompt`
- `buildFundamentalEventUserPrompt`
- `buildRiskChallengeSystemPrompt`
- `buildRiskChallengeUserPrompt`
- `buildFinalReportSystemPrompt`
- `buildFinalReportUserPrompt`
- `buildRepairPrompt`

上下文固定分层为：

- `marketSnapshot`
- `symbolProfile`
- `quoteSnapshot`
- `klineSummary`
- `technicalFeatures`
- `fundamentalSnapshot`
- `newsDigest`
- `eventDigest`
- `industryLinkage`
- `conceptLinkage`
- `indexLinkage`
- `historicalComparisons`
- `dataQualityFlags`

## UI 呈现规则

### 个股详情页

AI 区展示：

- 任务列表
- 当前任务状态
- 阶段轨迹时间线
- 最终报告结构化 sections

### 历史页

历史页展示：

- 任务时间线
- 已完成报告
- 阶段轨迹
- 导出 Markdown / PDF

## 当前限制

- 当前是固定 workflow，不是动态图执行图
- 还没有模型自主工具调用
- 扩展检索仍由 host orchestrator 控制
- 当前 worker 并发为 1
- DeepSearch 风格的跨轮证据回查和自动反证扩展还没进入第二期
