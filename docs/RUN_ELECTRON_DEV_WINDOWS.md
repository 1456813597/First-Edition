# Windows 下运行 Electron 开发版（逐步操作）

本文针对你当前报错：

```powershell
pnpm : 无法加载文件 ... pnpm.ps1，因为在此系统上禁止运行脚本
```

根因是 PowerShell 默认执行策略阻止了 `pnpm.ps1`。  
下面给你两种可用方案，推荐先用方案 A（不改系统全局策略）。

---

## 0. 先确认你在项目根目录

请先切到项目根目录（不是 `apps/desktop`）：

```powershell
cd "D:\codex\First Edition"
```

---

## 1. 方案 A（推荐）：每次用 Bypass 启动，不改系统策略

项目里已经有一个脚本：`scripts/pnpm-node.ps1`，它会优先使用 `tools/node24`，否则使用你系统里安装的 Node 24。

在项目根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -Command "& 'D:\codex\First Edition\scripts\pnpm-node.ps1' install --force"
powershell -ExecutionPolicy Bypass -Command "& 'D:\codex\First Edition\scripts\pnpm-node.ps1' --filter @stockdesk/desktop dev"
```

看到类似下面输出时表示成功：

- `electron-vite dev`
- `Local: http://...`
- Electron 窗口弹出

> 说明：这个方式只对这次命令生效，最安全，不会永久修改你的 PowerShell 策略。

---

## 2. 方案 B：给当前用户放开脚本执行（长期）

如果你希望以后直接用 `pnpm`，可以给**当前用户**设置执行策略：

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

执行后重开一个新的 PowerShell 窗口，再运行：

```powershell
cd "D:\codex\First Edition\apps\desktop"
pnpm run dev
```

如果公司设备有组策略限制，这条命令可能被拒绝；那就继续用方案 A。

---

## 3. 首次启动建议顺序（避免联调问题）

在项目根目录按顺序执行：

```powershell
powershell -ExecutionPolicy Bypass -Command "& 'D:\codex\First Edition\scripts\pnpm-node.ps1' install --force"
cd "D:\codex\First Edition\apps\data-service"
uv sync
cd "D:\codex\First Edition"
powershell -ExecutionPolicy Bypass -Command "& 'D:\codex\First Edition\scripts\pnpm-node.ps1' --filter @stockdesk/desktop dev"
```

原因：

- `install --force` 会在切换到 Node 24 后重编译 `better-sqlite3`
- `uv sync` 确保本地 Python 数据服务依赖齐全
- 桌面主进程开发态会调用 `apps/data-service/.venv/Scripts/python.exe`
- 当前桌面端绑定的是内嵌本地数据服务，设置页中的数据源信息只用于展示当前实际生效的本地服务状态，不支持切到外部 provider URL

## 3.1 环境版本建议

- Node: `24.14.0`（推荐 `24.x LTS`）
- Python: `3.13+`
- pnpm: `10.16.1`
- Windows: 优先在 Windows 11 上联调和打包

---

## 4. 常见问题排查

### 4.1 仍然提示 `pnpm.ps1` 被禁止

不要直接输入 `pnpm ...`，改用：

```powershell
powershell -ExecutionPolicy Bypass -Command "& 'D:\codex\First Edition\scripts\pnpm-node.ps1' --filter @stockdesk/desktop dev"
```

### 4.2 Electron 窗口没弹出

先确认命令输出里有没有构建错误；再执行：

```powershell
powershell -ExecutionPolicy Bypass -Command "& 'D:\codex\First Edition\scripts\pnpm-node.ps1' typecheck"
```

若 `typecheck` 报错，先修类型错误再启动。

### 4.3 报错 `does not provide an export named 'BrowserWindow'`

如果看到类似：

```text
SyntaxError: The requested module 'electron' does not provide an export named 'BrowserWindow'
```

通常是环境变量 `ELECTRON_RUN_AS_NODE=1` 导致 Electron 被当成普通 Node 运行。

先执行：

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
```

然后再启动：

```powershell
powershell -ExecutionPolicy Bypass -Command "& 'D:\codex\First Edition\scripts\pnpm-node.ps1' --filter @stockdesk/desktop dev"
```

> 现在脚本 `scripts/pnpm-node.ps1` 已经会自动清理该变量，并拒绝非 `24.x` 的 Node。

### 4.4 启动后页面一直加载/数据空白

通常是 Python 服务依赖没装好，重新执行：

```powershell
cd "D:\codex\First Edition\apps\data-service"
uv sync
```

---

## 5. 一键启动命令（你最常用）

日常直接复制这条即可：

```powershell
cd "D:\codex\First Edition"; powershell -ExecutionPolicy Bypass -Command "& 'D:\codex\First Edition\scripts\pnpm-node.ps1' --filter @stockdesk/desktop dev"
```
