# 织女星：下载、源码与构建

## 获取版本

- 公开分叉：[BlockComet/zhinvxing](https://github.com/BlockComet/zhinvxing)。GitHub 保留其与 [WhiteTowerAI/ohmygame](https://github.com/WhiteTowerAI/ohmygame) 的分叉关系。
- 默认中文分支：`feat/unified-game-studio`。`main` 保留创建分叉时的上游代码。
- 下载页：[GitHub Releases](https://github.com/BlockComet/zhinvxing/releases)。当前公开二进制为 Windows x64；macOS/Linux 尚未发布。
- 源码 ZIP 与发布标签对应，包含程序代码、品牌源图、测试、汉化维护脚本和新增功能文档。运行时、依赖与用户数据需另行准备。

## 开发与检查

需要 Node.js 22.19+ 和 Bun 1.4.2+：

```bash
git clone https://github.com/BlockComet/zhinvxing.git
cd zhinvxing
bun install --frozen-lockfile
bun run dev:desktop
```

```bash
bun run typecheck
bun run test
bun run build
```

账号、模型和云端配置见 [贡献指南](../CONTRIBUTING.md) 与 [.env.example](../.env.example)。配置值应放在未跟踪的 `.env.local`；本地游戏制作、材料分析和静态游戏导出不要求向本分叉提交账号信息。

## 品牌资源

`build/brand/` 保存品牌 PNG 源图。需要重新转换图标时，安装 Python 3 与 Pillow 后运行：

```bash
python -m pip install Pillow
python scripts/build-vega-icons.py
```

该脚本只转换尺寸与 PNG/ICO/ICNS 格式，不重新生成插画。

## 桌面构建

先准备 Capacitor 工具集，供软件生成 Android/iOS 原生工程：

```bash
mkdir -p .runtime/capacitor-tools
cp build/studio-tools/package.json build/studio-tools/package-lock.json .runtime/capacitor-tools/
cd .runtime/capacitor-tools
npm ci --ignore-scripts --no-audit --no-fund
cd ../..
```

以上目录创建与复制命令适用于 Bash；Windows 可使用等价的 PowerShell 文件操作。

Windows PowerShell 示例：

```powershell
New-Item -ItemType Directory -Path .runtime/capacitor-tools -Force
Copy-Item build/studio-tools/package*.json .runtime/capacitor-tools/
Push-Location .runtime/capacitor-tools
npm ci --ignore-scripts --no-audit --no-fund
Pop-Location
$env:DESKTOP_UPDATE_URL='https://github.com/BlockComet/zhinvxing/releases'
bun run prepare:desktop-runtime win32-x64
bun run build:desktop-app
bun --bun node_modules/electron-builder/cli.js --win nsis --x64 --publish never
```

安装包输出到 `release/`。中文版本的自动更新已关闭，该 URL 仅用于满足打包配置，不提供兼容上游的自动更新清单。发布的 Windows 包未进行代码签名。

macOS 构建沿用上游脚本，需要 macOS、相应运行时与分发配置。不能把生成 ICNS 或工程视为已完成 macOS 包验证。

## 维护上游关系

```bash
git remote add upstream https://github.com/WhiteTowerAI/ohmygame.git
git fetch upstream
```

合并上游变更前请在独立功能分支上检查中文界面、复原任务与导出行为。本分叉的 CI 对中文默认分支执行检查；上游依赖签名与 R2 配置的发布流程仅在上游仓库运行，本分叉通过 Releases 单独交付版本。

## 功能边界

新增能力与验收状态见 [开发状态](unified-studio.md)。本版本不携带作者的游戏客户端、存档、会话、模型密钥或运行数据；真实旧游戏复原、原生隔离执行和移动安装包交付仍需继续开发。

## 验证记录

发布前在 Windows 本机检查：

- TypeScript 类型检查与完整构建通过。
- `studio.test.ts`、`studios.test.ts`、`project-covers.test.ts`、`project-cover-api.test.ts`：4 个文件、24 项测试通过。
- 已安装 zh.7 并实际核对浅色首页、新徽标与侧栏图标。深色主题最后一轮界面检查被中断，尚未认定完成。
- 全量 `bun run test`：1158 项通过、102 项失败、19 项跳过，32 个测试文件未通过。已确认其中有原英文界面断言与中文界面不一致，以及 Windows POSIX 文件权限/符号链接权限测试失败；其余失败尚未逐项归因。

本版以 GitHub prerelease 发布，不宣称全量测试通过。CI 保留完整测试，不通过时应继续修复或更新有效断言，不通过跳过全部失败测试来掩盖问题。
