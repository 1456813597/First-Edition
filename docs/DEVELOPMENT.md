# 开发与验证说明

## 1. 推荐环境

### 目标环境

- OS: Windows 11
- Node: 22.22.0
- pnpm: 10.16.1
- Python: 3.13+

### 非目标环境

macOS / Linux 可以用于：

- 读代码
- 改前端
- 跑类型检查
- 跑不依赖原生 SQLite 绑定的测试

但不建议作为最终 Electron 打包和完整联调环境。

## 2. 安装

### Windows

```powershell
powershell -ExecutionPolicy Bypass -Command "& '.\scripts\pnpm-node22.ps1' install"
cd .\apps\data-service
uv sync
cd ..\..
```

### 非 Windows

```bash
npx pnpm@10.16.1 install
```

## 3. 启动桌面端

### Windows

```powershell
powershell -ExecutionPolicy Bypass -Command "& '.\scripts\pnpm-node22.ps1' --filter @stockdesk/desktop dev"
```

### 说明

- Electron 主进程会自动拉起 `apps/data-service/.venv/Scripts/python.exe`
- 当前应用绑定的是内嵌本地数据服务

## 4. 常用检查命令

### 全仓类型检查

```bash
npx pnpm@10.16.1 typecheck
```

### 共享包测试

```bash
npx pnpm@10.16.1 --filter @stockdesk/shared test
```

### 分析核心测试

```bash
npx pnpm@10.16.1 --filter @stockdesk/analysis-core test
```

### 数据库测试

```bash
npx pnpm@10.16.1 --filter @stockdesk/db test
```

注意：

- 这一步依赖 `better-sqlite3` 原生绑定
- 在错误的 Node 版本或未构建绑定的机器上会失败

## 5. 目录说明

- `apps/desktop/src/main`
  主进程与服务编排
- `apps/desktop/src/preload`
  renderer 安全桥接
- `apps/desktop/src/renderer`
  UI 层
- `apps/data-service/src/stockdesk_service`
  Python 数据服务
- `packages/shared`
  schema、类型、IPC 合约
- `packages/analysis-core`
  特征工程与 prompt
- `packages/db`
  SQLite repository

## 6. 开发建议

### 改 UI 时

- 优先复用 Fluent 组件
- 尽量把页面保持为“工作台”而不是普通 Web 列表页
- 结构化信息优先于装饰动画

### 改数据层时

- 先确认是“实时数据”还是“可缓存数据”
- 明确缓存 TTL 和失效策略
- 不要在 renderer 直接拼接远程 API 协议

### 改分析层时

- 保持输出结构化 JSON
- 先改 schema，再改 prompt，再改 renderer 显示
- 每次扩展输入字段时，检查 `featurePack`、prompt、历史展示是否同步

## 7. 当前已知环境问题

- `better-sqlite3` 在非目标 Node 版本上可能缺少预编译 binding
- Python 服务要求 `3.13+`
- 当前仓库没有完整 CI，很多回归仍依赖本地执行

## 8. 文档同步原则

修改以下内容后，必须同步更新文档：

- 启动方式
- 运行依赖版本
- IPC 合约
- 数据源能力边界
- 分析任务结构
