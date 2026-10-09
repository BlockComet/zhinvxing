import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { copyFile, cp, lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { ZipFile } from "yazl";
import type { ProjectManager } from "./projects.js";
import type { StudioExport, StudioTarget } from "../shared/studio.js";
import { atomicJson, type RestorationStore } from "./restoration.js";
import { copyInventory, digest, inside, inventory, StudioError } from "./studio-files.js";

const WEB_EXTENSIONS = new Set([".html", ".htm", ".js", ".mjs", ".css", ".json", ".wasm", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico", ".avif", ".mp3", ".ogg", ".wav", ".mp4", ".webm", ".woff", ".woff2", ".ttf", ".glb", ".gltf", ".bin", ".ktx2", ".txt", ".xml", ".webmanifest"]);
export class StudioExporter {
  constructor(private projects: ProjectManager, private store: RestorationStore, private runtimeCandidates: string[], private capacitorCandidates: string[] = []) {}
  async generate(id: string, target: StudioTarget, sourceDirectory: string): Promise<StudioExport> {
    return this.store.exclusive(id, async () => {
      const project = this.projects.get(id);
      if (!project) throw new StudioError("项目不存在", 404);
      const workspace = await realpath(project.workspacePath);
      const requested = path.resolve(workspace, sourceDirectory || "dist");
      if (!inside(workspace, requested)) throw new StudioError("导出目录必须位于项目中。");
      const source = await realpath(requested).catch(() => { throw new StudioError("找不到静态游戏目录，请先在工作台构建，或指定包含 index.html 的目录。"); });
      if (!inside(workspace, source) || !(await lstat(source)).isDirectory()) throw new StudioError("不能导出项目外部目录。");
      const files = await inventory(source);
      if (!files.some(file => file.path === "index.html")) throw new StudioError("请选择包含 index.html 的静态游戏目录。原生客户端不能直接转换为 Web 游戏。");
      // Export a dedicated static build only. Never silently bundle unknown authoring files.
      for (const file of files) {
        const parts = file.path.split("/");
        if (parts.some(part => part.startsWith(".") || /^(node_modules|restoration-work|restoration-history.*|original|conversations|pi-agent|canvas)$/i.test(part)) || /(^|\/)(package(-lock)?\.json|bun\.lock|RESTORATION\.md|AGENTS\.md|.*(?:credentials|secrets|api[-_]?keys|auth-tokens).*|.*\.map)$/i.test(file.path) || !WEB_EXTENSIONS.has(path.extname(file.path).toLowerCase())) {
          throw new StudioError(`静态产物含非游戏文件：${file.path}。请在专用构建目录整理后重试。`);
        }
      }
      const exportId = randomUUID();
      const directory = path.join(this.store.directory(id), "exports", exportId);
      const web = path.join(directory, "www");
      await copyInventory(source, web, files);
      const result: StudioExport = { id: exportId, target, createdAt: new Date().toISOString(), directory, status: "project-generated", verification: "not-run", notes: ["尚未运行验证。请检查输入、屏幕布局、存档、音频与性能。", "导出使用独立静态目录；游戏自身代码中若写入了密钥，仍需在发布前移除。"] };
      if (target === "web") {
        result.artifact = path.join(directory, "web-game.zip");
        await zipDirectory(web, result.artifact);
        result.status = "built";
      } else if (target === "windows" || target === "macos") {
        await writeFile(path.join(directory, "main.cjs"), DESKTOP_MAIN);
        await atomicJson(path.join(directory, "package.json"), { name: `game-${id}`, productName: project.name, version: "1.0.0", main: "main.cjs", private: true,
          scripts: { start: "electron .", package: `electron-builder --${target === "windows" ? "win" : "mac"} --publish never` },
          devDependencies: { electron: "43.3.0", "electron-builder": "26.15.3" }, build: { appId: `local.game.p${id.replaceAll("-", "")}`, files: ["main.cjs", "www/**/*", "package.json"], ...(target === "windows" ? { win: { target: "nsis" } } : { mac: { target: "dmg" } }) } });
        if (target === "windows" && process.platform === "win32") {
          const runtime = await this.windowsRuntime();
          if (runtime) {
            const portable = path.join(directory, "windows-portable");
            await mkdir(portable, { recursive: true });
            const exe = (await readdir(runtime)).find(name => /^(electron|OhMyGame)\.exe$/i.test(name))!;
            for (const name of await readdir(runtime)) {
              if (name === exe) await copyFile(path.join(runtime, name), path.join(portable, "Game.exe"));
              else if (name === "locales" || /\.(dll|pak|bin|dat)$/.test(name) || /^(LICENSE|LICENSES|vk_swiftshader_icd\.json)/.test(name)) await cp(path.join(runtime, name), path.join(portable, name), { recursive: true });
            }
            const app = path.join(portable, "resources", "app");
            await mkdir(app, { recursive: true });
            await cp(web, path.join(app, "www"), { recursive: true });
            await copyFile(path.join(directory, "main.cjs"), path.join(app, "main.cjs"));
            await atomicJson(path.join(app, "package.json"), { name: `game-${id}`, productName: project.name, version: "1.0.0", main: "main.cjs" });
            result.artifact = path.join(portable, "Game.exe");
            result.status = "built";
            result.notes.push("已生成 Windows 便携版（整个 windows-portable 文件夹一起分发）。未签名，尚未安装或试玩验证。");
          } else result.notes.push("未找到本机 Electron 运行时；工程已生成，可安装依赖后构建。");
        } else result.notes.push("已生成桌面工程；macOS 构建、签名与验证需要相应环境。");
      } else {
        await atomicJson(path.join(directory, "package.json"), { name: `game-${id}`, version: "1.0.0", private: true,
          scripts: { "native:add": `cap add ${target}`, "native:sync": `cap sync ${target}`, "native:open": `cap open ${target}` },
          dependencies: { "@capacitor/core": "8.5.3", [`@capacitor/${target}`]: "8.5.3" }, devDependencies: { "@capacitor/cli": "8.5.3" } });
        await atomicJson(path.join(directory, "capacitor.config.json"), { appId: `local.game.p${id.replaceAll("-", "")}`, appName: project.name, webDir: "www" });
        const toolset = await this.capacitorToolset();
        if (toolset) {
          await cp(path.join(toolset, "node_modules"), path.join(directory, "node_modules"), { recursive: true });
          const outcome = await runCapacitor(directory, target);
          await writeFile(path.join(directory, "native-generation.log"), outcome.log);
          result.nativeProject = outcome.ok;
          result.notes.push(outcome.ok ? `已生成${target === "android" ? " Android 原生工程，可用 Android Studio 打开 android 目录；APK / AAB 尚未构建" : " iOS 原生工程；归档、签名、安装尚未验证"}。` : "原生工程生成未完成，请查看 native-generation.log；输入工程和静态游戏已保留。");
        } else result.notes.push(`已生成 Capacitor 输入工程。尚未执行 native:add，尚无${target === "android" ? " Android 原生工程、APK 或 AAB" : " Xcode 原生工程或 IPA"}。`);
      }
      if (result.artifact) result.sha256 = await digest(result.artifact);
      await atomicJson(path.join(directory, "export-manifest.json"), { ...result, sourceFiles: files });
      await writeFile(path.join(directory, "交付说明.txt"), [project.name, `目标：${target}`, `状态：${result.status}`, ...result.notes, "", "工程后续操作（需自行具备对应构建环境）：", target === "android" || target === "ios" ? "npm install\nnpm run native:add\nnpm run native:sync\nnpm run native:open" : "桌面工程：npm install，再 npm run package。Web ZIP 可部署到静态站点。", "Android：APK 用于安装；AAB 用于发布。iOS：需要 macOS、Xcode 和签名配置。"].join("\n"));
      const state = await this.store.state(id);
      await atomicJson(path.join(this.store.directory(id), "exports.json"), [...state.exports, result]);
      return result;
    });
  }
  private async windowsRuntime(): Promise<string | undefined> {
    for (const candidate of this.runtimeCandidates) {
      const entries: string[] = await readdir(candidate).catch((): string[] => []);
      if (entries.some(entry => /^(electron|OhMyGame)\.exe$/i.test(entry)) && entries.includes("resources.pak")) return candidate;
    }
    return undefined;
  }
  private async capacitorToolset(): Promise<string | undefined> {
    for (const candidate of this.capacitorCandidates) {
      if (await lstat(path.join(candidate, "node_modules/@capacitor/cli/bin/capacitor")).catch(() => undefined)) return candidate;
    }
    return undefined;
  }
}
async function runCapacitor(directory: string, target: "android" | "ios"): Promise<{ ok: boolean; log: string }> {
  const env: NodeJS.ProcessEnv = { CI: "1", NO_COLOR: "1", CAPACITOR_DISABLE_TELEMETRY: "1", ELECTRON_RUN_AS_NODE: "1" };
  for (const key of ["SystemRoot", "WINDIR", "TEMP", "TMP", "HOME", "USERPROFILE", "PATH", "Path", "COMSPEC", "PATHEXT"]) if (process.env[key]) env[key] = process.env[key];
  return new Promise(resolve => {
    let log = "";
    const child = spawn(process.execPath, [path.join(directory, "node_modules/@capacitor/cli/bin/capacitor"), "add", target], { cwd: directory, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const append = (data: Buffer) => { log = (log + data.toString()).slice(-200_000); };
    child.stdout.on("data", append); child.stderr.on("data", append);
    const timeout = setTimeout(() => { log += "\n原生工程生成超过 60 秒，已停止。"; child.kill(); }, 60_000);
    child.on("error", error => { clearTimeout(timeout); resolve({ ok: false, log: log + error.message }); });
    child.on("close", code => { clearTimeout(timeout); resolve({ ok: code === 0, log }); });
  });
}
async function zipDirectory(root: string, output: string): Promise<void> {
  const zip = new ZipFile();
  for (const file of await inventory(root)) zip.addFile(path.join(root, file.path), file.path);
  zip.on("error", error => (zip.outputStream as Readable).destroy(error));
  const completed = pipeline(zip.outputStream, createWriteStream(output, { flags: "wx" }));
  zip.end();
  await completed;
}
// The game contains no editor IPC, daemon token, account settings, or Node access.
const DESKTOP_MAIN = `const { app, BrowserWindow, session, protocol, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, 'www');
let window;
protocol.registerSchemesAsPrivileged([{ scheme: 'game', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  protocol.handle('game', request => {
    try {
      const url = new URL(request.url);
      if (url.host !== 'local') return new Response('', {status: 404});
      const pathname = decodeURIComponent(url.pathname);
      const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      const rel = path.relative(root, file);
      if (rel.startsWith('..') || path.isAbsolute(rel) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response('', {status: 404});
      return net.fetch(pathToFileURL(file).href);
    } catch { return new Response('', {status: 400}); }
  });
  window = new BrowserWindow({ title: app.getName(), width: 1100, height: 760, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  window.setMenu(null);
  window.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('game://local/')) event.preventDefault(); });
  window.loadURL('game://local/index.html');
});
app.on('window-all-closed', () => app.quit());
`;
