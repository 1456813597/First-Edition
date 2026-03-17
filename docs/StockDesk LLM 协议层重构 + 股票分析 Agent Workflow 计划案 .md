# StockDesk LLM 协议层重构 + 股票分析 Agent Workflow 计划案

## 摘要

本次按你确认的方向设计首期方案：

- 一次性支持 4 类协议
  - `openai_responses`
  - `openai_chat_compatible`
  - `openrouter_api`
  - `bailian_responses_cn`
- 分析任务采用“单任务、多阶段”的固定 workflow，不做首期动态图分支
- 报告输出采用“最终报告 JSON + 阶段轨迹 JSON”双层结构，任务后台持久化执行，UI 友好展示，不依赖原始自然语言渲染

首期目标不是做通用 agent 平台，而是做“面向 A 股研究”的专用编排层：协议可切换、任务可持久化、阶段可追踪、最终报告可渲染。

## 关键改造

### 1. LLM 协议层重构

将当前单一 `LlmClient` 重构为“编排层 + 协议适配器”：

- 新增统一接口 `LlmProtocolAdapter`
  - `testConnection(profile, apiKey)`
  - `invokeStructured(profile, apiKey, request)`
  - 返回统一的 `NormalizedLlmResponse`
- `NormalizedLlmResponse` 固定包含：
  - `text`
  - `rawPayload`
  - `requestId`
  - `usage`
  - `model`
  - `finishReason`
- 协议适配器固定实现 4 个：
  - `OpenAIResponsesAdapter`
  - `OpenAIChatCompatibleAdapter`
  - `OpenRouterApiAdapter`
  - `BailianResponsesCnAdapter`
- `LlmClient` 不再直接拼 endpoint，只负责：
  - 选择 adapter
  - 统一超时与重试
  - JSON 提取与 schema 校验
  - repair pass
  - 归一化错误模型

### 2. 配置模型与对外接口

扩展 `LlmProfile`，保留现有字段，新增以下字段：

- `protocol: "openai_responses" | "openai_chat_compatible" | "openrouter_api" | "bailian_responses_cn"`
- `displayProviderName: string`
- `advancedHeaders?: Record<string, string>`
- `supportsJsonSchema` 保留，但语义改为“允许该 profile 启用严格 schema 模式”，实际是否生效由 adapter 决定

设置与测试接口同步调整：

- `settings:testLlmProfile` 必须按 `protocol` 走对应 adapter 的 `testConnection`
- 设置页增加协议选择
- UI 不暴露协议细节差异，只展示“Provider / Protocol / Base URL / Model / Schema 支持状态”

兼容策略：

- 现有未带 `protocol` 的旧 profile 在迁移时默认映射为 `openai_chat_compatible`
- 现有 `analysis:run` 不直接删除，保留一版 shim，但 UI 迁移到新任务接口

### 3. 分析任务改为后台持久化工作流

新增任务概念，任务和最终报告分离：

- `analysis_tasks`
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
- `analysis_stage_runs`
  - `id`
  - `taskId`
  - `stageKey`
  - `stageOrder`
  - `actorKind`
  - `status`
  - `model`
  - `startedAt`
  - `completedAt`
  - `inputPayload`
  - `outputPayload`
  - `rawPayload`
  - `usagePayload`
  - `errorSummary`

保留现有 `analysis_runs` 作为“最终完成报告”表，不承担任务生命周期。

新增 IPC：

- `analysis:startTask`
- `analysis:listTasks`
- `analysis:getTask`
- `analysis:getTaskStages`
- `analysis:cancelTask` 首期保留接口但只允许取消未开始任务
- `analysis:getRun` 继续用于读取最终报告

### 4. 固定阶段 Agent Workflow

首期 workflow 固定 8 个 stage，不做动态图：

1. `snapshot_collect`
   - Host stage
   - 拉取 quote、日线、分时、新闻、事件、财务、个股资料、板块联动、指数联动、交易日历
   - 生成标准化 research context
2. `research_plan`
   - LLM stage
   - 输出研究计划 JSON
   - 包含关注维度、关键问题、证据优先级、缺口判断
3. `evidence_expand`
   - Host stage
   - 根据 research plan 补充数据
   - 仅允许调用白名单工具：同板块快照、宽基指数、概念板块、历史分析对比
4. `technical_analysis`
   - LLM stage
   - 只输出技术面与市场结构结论 JSON
5. `fundamental_event_analysis`
   - LLM stage
   - 只输出财务、新闻、事件、行业联动结论 JSON
6. `risk_challenge`
   - LLM stage
   - 从反方视角审查前两阶段结论，输出风险、反证条件、置信度修正
7. `final_report`
   - LLM stage
   - 产出最终报告 JSON
8. `validate_and_persist`
   - Host stage
   - 校验最终 schema
   - 必要时发起 repair pass
   - 成功后写入 `analysis_runs` 和 stage traces

首期明确约束：

- 不允许模型自行发任意工具调用
- 所有“扩展检索”由 host orchestrator 执行
- 每个 stage 的输入输出都必须结构化
- 同一任务单 worker 串行执行
- 阶段失败时任务进入 `failed`，不自动跳过后续 stage

### 5. JSON 报告与阶段轨迹设计

最终报告使用新 schema，建议命名为 `analysis_report_v2`，固定包含：

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
  - `bull`
  - `base`
  - `bear`
- `riskMatrix`
- `invalidationSignals`
- `actionPlan`
- `evidence`
- `dataQuality`
- `disclaimer`

阶段轨迹 schema 固定包含：

- `stageKey`
- `stageOrder`
- `status`
- `actorKind`
- `title`
- `summary`
- `startedAt`
- `completedAt`
- `structuredInput`
- `structuredOutput`
- `rawPayloadRef`
- `usage`
- `errorSummary`

UI 规则固定：

- 个股页 AI 区显示“任务列表 + 当前任务进度 + 最终报告 sections + 阶段轨迹时间线”
- 历史页显示“最终报告卡片”，点开后可查看阶段轨迹
- UI 不直接展示原始 prompt 和原始 raw response，除非进入开发模式

### 6. A 股专用提示词与上下文规范

提示词不再是单块 prompt，改为阶段化模板：

- `research_plan_prompt`
- `technical_analysis_prompt`
- `fundamental_event_prompt`
- `risk_challenge_prompt`
- `final_report_prompt`
- `repair_prompt`

统一输入上下文固定分层：

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

提示词约束固定：

- 只允许基于输入快照推理
- 所有结论必须可回溯到 evidence
- 强制输出反证条件
- 强制给出 bull/base/bear 三情景
- 强制给出“不构成投资建议”字段
- 不允许确定性收益措辞

## 开发改造清单

### 协议层

- 扩展 `LlmProfile` 类型、schema、设置持久化
- 新增 adapter registry
- 拆分 `LlmClient` 为：
  - adapter selector
  - common validation pipeline
  - common retry/repair pipeline
- 补 `settings:testLlmProfile` 的协议感知测试逻辑

### 任务层

- 新增任务表与 stage 表
- `AnalysisService` 改名或内部分拆为：
  - `AnalysisTaskService`
  - `AnalysisWorkflowRunner`
  - `AnalysisReportPersister`
- 当前 `analysis:run` 迁移为 `analysis:startTask`
- 队列状态从“当前运行中任务”升级为“任务状态机 + stage 进度”

### UI 层

- 个股页 AI 区从“直接等待完成结果”改为：
  - 点击启动任务后立即返回 task id
  - 展示 pending/running/completed/failed
  - 完成后挂接最终报告
- 历史页改为以最终报告为主，支持查看 task trace
- 设置页新增协议选择和协议说明

### 文档层

新增并维护：

- `docs/LLM_PROTOCOLS.md`
- `docs/AGENT_WORKFLOW.md`

内容必须覆盖：

- 4 协议差异
- profile 配置说明
- task/stage 状态机
- 最终报告 JSON schema
- 阶段轨迹 schema
- 兼容迁移策略

## 测试与验收

### 单元测试

- 4 个 adapter 的请求构造与响应归一化
- schema 校验与 repair 分支
- 任务状态机转换
- stage trace 序列化与持久化
- 旧 profile 到新 profile 的迁移逻辑

### 集成测试

- `analysis:startTask` 立即返回 task summary
- 成功任务能产出完整 `analysis_report_v2`
- 失败任务能保留失败 stage trace
- `settings:testLlmProfile` 对 4 协议分别走正确测试路径
- 个股页能同时展示：
  - 任务状态
  - 最终报告
  - 阶段轨迹

### 验收场景

- 用 `openai_responses` 跑完整任务并成功落库
- 用 `openai_chat_compatible` 跑完整任务并成功落库
- 用 `openrouter_api` 跑完整任务并成功落库
- 用 `bailian_responses_cn` 跑完整任务并成功落库
- 非法 JSON、schema 不匹配、阶段超时、单 stage 失败都能正确记录并展示

## 假设与默认

- 本次按“一期完整支持四协议”设计，不拆二期
- OpenRouter 首期按其主 API 适配，不额外引入自定义 provider-routing 策略
- 首期不做流式增量 UI，只做后台持久任务 + 最终报告 + 阶段轨迹
- 首期不做模型自主任意工具调用，所有扩展检索都由 host orchestrator 白名单执行
- 首期 worker 并发默认仍为 1，后续再考虑多任务并行
- 旧 `analysis:run` 保留一版兼容 shim，但新 UI 与新逻辑统一迁移到 `analysis:startTask`
