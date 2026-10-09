import { mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ZipFile } from "yazl";
import Fastify from "fastify";
import { ProjectManager } from "../src/daemon/projects.js";
import { RestorationStore } from "../src/daemon/restoration.js";
import { StudioExporter } from "../src/daemon/studio-export.js";
import { registerStudioRoutes } from "../src/daemon/studio-routes.js";
import { appendSystemPromptForProject } from "../src/daemon/agent-prompts.js";
import { createApp } from "../src/daemon/app.js";
import { copyInventory, inventory } from "../src/daemon/studio-files.js";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "omg-studio-"));
  const projects = new ProjectManager(path.join(root, "data"));
  await projects.load();
  const store = new RestorationStore(path.join(root, "data"), projects);
  const source = path.join(root, "client");
  await mkdir(source);
  await writeFile(path.join(source, "config.ini"), "server=offline\n");
  return { root, projects, store, source };
}
describe("restoration source continuity", () => {
  it("preserves originals, hashes copied files, persists and reversibly rolls back modifications", async () => {
    const { source, store, projects } = await fixture();
    const { projectId } = await store.import(source, "旧游戏", "进入地图");
    const project = projects.get(projectId)!;
    const file = path.join(project.workspacePath, "restoration-work/config.ini");
    await writeFile(file, "server=localhost\n");
    expect(await readFile(path.join(source, "config.ini"), "utf8")).toBe("server=offline\n");
    await store.rollback(projectId);
    expect(await readFile(file, "utf8")).toBe("server=offline\n");
    await writeFile(file, "editable after rollback");
    const history = (await readdir(project.workspacePath)).find(name => name.startsWith("restoration-history"))!;
    expect(await readFile(path.join(project.workspacePath, history, "config.ini"), "utf8")).toBe("server=localhost\n");
    const state = await store.state(projectId);
    expect(state.restoration?.files[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(state.restoration?.milestones.at(-1)?.status).toBe("blocked");
    await store.update(projectId, { state: "paused", route: "rebuild" });
    const restored = new RestorationStore(path.dirname(store.root), projects);
    expect((await restored.state(projectId)).restoration).toMatchObject({ state: "paused", route: "rebuild" });
  });
  it("attaches an existing directory without copying and refuses snapshot rollback", async () => {
    const { source, store, projects } = await fixture();
    await writeFile(path.join(source, "save.json"), '{"xp":25}');
    const { projectId } = await store.import(source, "现有客户端", "保留进度", "in-place");
    const project = projects.get(projectId)!;
    expect(project.workspaceLocation).toBe("external");
    expect(project.workspacePath).toBe(source);
    expect(await readdir(store.directory(projectId))).not.toContain("original");
    expect(await readdir(source)).not.toContain("restoration-work");
    expect((await store.state(projectId)).restoration?.storageMode).toBe("in-place");
    await expect(store.rollback(projectId)).rejects.toThrow("没有原始快照");
    await store.update(projectId, { state: "paused" });
    expect(await readFile(path.join(source, "RESTORATION.md"), "utf8")).toContain("直接修改");
    await projects.delete(projectId);
    expect(await readFile(path.join(source, "save.json"), "utf8")).toBe('{"xp":25}');
    expect(await readFile(path.join(source, "config.ini"), "utf8")).toBe("server=offline\n");
  });
  it("rejects in-place file inputs and protects existing task notes", async () => {
    const { source, store } = await fixture();
    await expect(store.import(path.join(source, "config.ini"), "", "test", "in-place")).rejects.toThrow("整个游戏文件夹");
    await writeFile(path.join(source, "RESTORATION.md"), "existing notes");
    await expect(store.import(source, "", "test", "in-place")).rejects.toThrow("已有 RESTORATION.md");
    expect(await readFile(path.join(source, "RESTORATION.md"), "utf8")).toBe("existing notes");
  });
  it("recognizes APK container evidence without calling it recovered source", async () => {
    const { source, store } = await fixture();
    const zip = new ZipFile();
    const output = new Promise<Buffer>((resolve, reject) => { const chunks: Buffer[] = []; zip.outputStream.on("data", chunk => chunks.push(chunk)); zip.outputStream.on("end", () => resolve(Buffer.concat(chunks))); zip.outputStream.on("error", reject); });
    zip.addBuffer(Buffer.from("fixture, not an installable manifest"), "AndroidManifest.xml");
    zip.addBuffer(Buffer.from("dex fixture"), "classes.dex"); zip.end();
    const apk = path.join(source, "sample.apk"); await writeFile(apk, await output);
    const { projectId } = await store.import(apk, "APK 样本", "分析");
    const state = await store.state(projectId);
    expect(state.restoration?.findings).toContainEqual(expect.objectContaining({ certainty: "confirmed", message: expect.stringContaining("未恢复源码") }));
    expect(state.restoration?.files).toHaveLength(1);
  });
  it("rejects junctions instead of importing files outside the source", async () => {
    const { source, root, store } = await fixture();
    const outside = path.join(root, "outside"); await mkdir(outside);
    await symlink(outside, path.join(source, "escape"), process.platform === "win32" ? "junction" : "dir");
    await expect(store.import(source, "", "test")).rejects.toThrow(/链接|联接/);
  });
  it("compares canonical source roots when a parent path is redirected", async () => {
    const { source, root } = await fixture();
    const alias = path.join(root, "logical-storage");
    await symlink(root, alias, process.platform === "win32" ? "junction" : "dir");
    const files = await inventory(source);
    const output = path.join(root, "copied");
    await copyInventory(path.join(alias, "client"), output, files);
    expect(await readFile(path.join(output, "config.ini"), "utf8")).toBe("server=offline\n");
  });
  it("rejects mutated original evidence before replacing a working copy", async () => {
    const { source, store, projects } = await fixture();
    const { projectId } = await store.import(source, "", "test");
    const { chmod } = await import("node:fs/promises");
    const original = path.join(store.directory(projectId), "original/config.ini");
    await chmod(original, 0o600); await writeFile(original, "tampered");
    await expect(store.rollback(projectId)).rejects.toThrow("变化");
    expect(await readFile(path.join(projects.get(projectId)!.workspacePath, "restoration-work/config.ini"), "utf8")).toBe("server=offline\n");
  });
  it("does not impose Web game architecture on imported clients", () => {
    const prompt = appendSystemPromptForProject({ type: "web-game", restoration: true }).join("\n");
    expect(prompt).toContain("not necessarily a browser game");
    expect(prompt).not.toContain("The game is a Node project");
  });
  it("protects imports with the daemon token, blocks native preview and paused turns", async () => {
    const { root, source } = await fixture();
    const app = createApp({ dataDirectory: path.join(root, "actual-app"), accessToken: "fixture-token" });
    const headers = { authorization: "Bearer fixture-token" };
    try {
      expect((await app.inject({ method: "POST", url: "/studio/import", payload: { sourcePath: source, goal: "测试" } })).statusCode).toBe(401);
      const imported = await app.inject({ method: "POST", url: "/studio/import", headers, payload: { sourcePath: source, goal: "测试" } });
      expect(imported.statusCode).toBe(200);
      const id = imported.json().projectId;
      const preview = await app.inject({ method: "POST", url: `/projects/${id}/preview`, headers });
      expect(preview.statusCode).toBe(409); expect(preview.json().error).toContain("隔离运行器");
      await app.inject({ method: "PATCH", url: `/projects/${id}/studio/restoration`, headers, payload: { state: "paused" } });
      const turn = await app.inject({ method: "POST", url: `/projects/${id}/conversations/fixture/turns`, headers, payload: { prompt: "继续" } });
      expect(turn.statusCode).toBe(409); expect(turn.json().error).toContain("已暂停");
    } finally { await app.close(); }
  });
});
describe("local game exports", () => {
  async function game() {
    const setup = await fixture(); const project = await setup.projects.create("样本游戏");
    const dist = path.join(project.workspacePath, "dist"); await mkdir(dist);
    await writeFile(path.join(dist, "index.html"), "<!doctype html><button onclick='this.textContent=Number(this.textContent)+1'>0</button>");
    return { ...setup, project, dist, exporter: new StudioExporter(setup.projects, setup.store, []) };
  }
  it("creates real Web ZIP without product login and persists unverified status", async () => {
    const { exporter, project, store } = await game();
    const result = await exporter.generate(project.id, "web", "dist");
    expect(result.status).toBe("built"); expect(result.verification).toBe("not-run");
    expect((await readFile(result.artifact!)).subarray(0, 2).toString()).toBe("PK");
    expect((await store.state(project.id)).exports).toHaveLength(1);
  });
  it("rejects author secrets and source roots, rather than silently exporting them", async () => {
    const { exporter, project, dist } = await game();
    await writeFile(path.join(dist, ".env"), "FAKE_KEY=not-a-secret");
    await expect(exporter.generate(project.id, "web", "dist")).rejects.toThrow("非游戏文件");
    await expect(exporter.generate(project.id, "web", "..")).rejects.toThrow("项目中");
  });
  it("generates separate mobile config without inventing APK or iOS build success", async () => {
    const { exporter, project } = await game();
    for (const target of ["android", "ios"] as const) {
      const result = await exporter.generate(project.id, target, "dist");
      expect(result.status).toBe("project-generated"); expect(result.artifact).toBeUndefined();
      const config = JSON.parse(await readFile(path.join(result.directory, "capacitor.config.json"), "utf8"));
      expect(config).toMatchObject({ appName: "样本游戏", webDir: "www" });
      expect(result.notes.join(" ")).toContain("尚未执行 native:add");
    }
  });
  it("keeps desktop project independent of editor and account dependencies", async () => {
    const { exporter, project } = await game();
    const result = await exporter.generate(project.id, "windows", "dist");
    const pkg = JSON.parse(await readFile(path.join(result.directory, "package.json"), "utf8"));
    expect(pkg.build.files).toEqual(["main.cjs", "www/**/*", "package.json"]);
    expect(await readFile(path.join(result.directory, "main.cjs"), "utf8")).toContain("sandbox: true");
    expect(result.status).toBe("project-generated");
  });
  it("validates API input and blocks rollback while an AI turn is active", async () => {
    const { projects, store, source } = await fixture();
    const app = Fastify({ ajv: { customOptions: { coerceTypes: false } } });
    registerStudioRoutes(app, projects, store, [], () => true);
    try {
      const invalid = await app.inject({ method: "POST", url: "/studio/import", payload: { sourcePath: 42, goal: "x" } });
      expect(invalid.statusCode).toBe(400);
      const imported = await app.inject({ method: "POST", url: "/studio/import", payload: { sourcePath: source, goal: "地图" } });
      expect(imported.statusCode).toBe(200);
      const response = await app.inject({ method: "POST", url: `/projects/${imported.json().projectId}/studio/rollback` });
      expect(response.statusCode).toBe(409);
    } finally { await app.close(); }
  });
});
