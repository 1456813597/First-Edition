# LLM 协议层说明

## 目标

StockDesk 的 LLM 层已经从单一 OpenAI-compatible 调用器重构为“统一编排层 + 协议适配器”。

当前统一入口位于：

- `apps/desktop/src/main/services/llmClient.ts`
- `apps/desktop/src/main/services/llmProtocolAdapters.ts`

渲染层和分析任务不再直接感知底层协议差异，只需要依赖 `LlmProfile.protocol`。

## 当前支持的协议

### `openai_responses`

- 默认 Base URL：`https://api.openai.com/v1`
- 目标接口：`/responses`
- 适合原生 Responses API 的结构化输出和更统一的多模态/工具扩展路线

### `openai_chat_compatible`

- 默认 Base URL：`https://api.openai.com/v1`
- 目标接口：`/chat/completions`
- 兼容大量 OpenAI-compatible 服务，是当前兼容性最稳妥的默认兜底协议

### `openrouter_api`

- 默认 Base URL：`https://openrouter.ai/api/v1`
- 当前走 `chat/completions`
- 支持通过 `advancedHeaders` 透传 OpenRouter 需要的扩展 header

### `bailian_responses_cn`

- 默认 Base URL：`https://dashscope.aliyuncs.com/compatible-mode/v1`
- 目标接口：`/responses`
- 面向阿里云百炼大陆地区 OpenAI-compatible Responses 格式

## Profile 配置模型

`LlmProfile` 关键字段如下：

- `id`
- `name`
- `protocol`
- `displayProviderName`
- `baseUrl`
- `model`
- `timeoutMs`
- `maxRetries`
- `supportsJsonSchema`
- `advancedHeaders`

说明：

- `protocol` 决定选择哪个适配器
- `displayProviderName` 只用于 UI 展示
- `supportsJsonSchema` 表示是否允许当前 profile 开启严格 schema 模式
- `advancedHeaders` 用于透传额外请求头，例如 OpenRouter 的站点信息或自定义网关 header

## 设置页行为

设置页和初始化页都会展示统一字段：

- Provider
- Protocol
- Base URL
- Model
- Strict JSON Schema
- Advanced Headers JSON

UI 不展示协议内部实现差异，差异由主进程适配器处理。

## 统一适配器接口

每个协议适配器实现统一接口：

- `testConnection(profile, apiKey)`
- `invokeStructured(profile, apiKey, request)`

统一返回 `NormalizedLlmResponse`：

- `text`
- `rawPayload`
- `requestId`
- `usage`
- `model`
- `finishReason`

这保证后续的结构化校验、repair pass、持久化 artifact 不依赖具体 provider。

## 结构化输出校验链

`LlmClient` 负责共通逻辑：

1. 根据 `protocol` 选择 adapter
2. 发起结构化调用
3. 从文本中抽取 JSON
4. 用 Zod schema 校验
5. 校验失败时按 `maxRetries` 执行 repair pass
6. 返回统一 `StructuredLlmResult`

当前 repair 机制会：

- 强制要求只输出一个 JSON 对象
- 回传上一次错误详情
- 回传上一次模型文本输出

## 兼容迁移

旧版未带 `protocol` 的 profile 在数据库读取时会默认映射为：

- `openai_chat_compatible`

这样旧配置不会因为 schema 升级直接失效。

## 测试接口

主进程 IPC：

- `settings:testLlmProfile`

测试逻辑会：

1. 读取当前 profile
2. 从系统 keyring 取 API key
3. 按 `protocol` 选择对应适配器
4. 执行真实协议连通性测试

## 当前限制

- OpenRouter 当前首期仍按其主 API 路由，不额外做 provider routing 策略
- 首期未做 streaming UI
- 首期未引入工具调用型 agent 协议，所有扩展检索仍由 host orchestrator 负责
