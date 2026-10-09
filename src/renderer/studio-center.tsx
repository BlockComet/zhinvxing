import { useEffect, useRef, useState } from "react";
import { request, waitForRuntime } from "./api.js";
import type { StudioState, StudioTarget } from "../shared/studio.js";
import "./studio-center.css";

const TARGETS: Record<StudioTarget, string> = { web: "Web", windows: "Windows", macos: "macOS", android: "Android", ios: "iOS" };
export function StudioCenter({ projectId, onClose, onOpen }: { projectId?: string; onClose: () => void; onOpen?: (id: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<StudioState>();
  const [source, setSource] = useState("");
  const [storageMode, setStorageMode] = useState<"copy" | "in-place">("copy");
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("确认启动阻塞，并制定恢复单机体验的计划");
  const [target, setTarget] = useState<StudioTarget>("windows");
  const [directory, setDirectory] = useState("dist");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rollback, setRollback] = useState(false);
  const endpoint = `/projects/${projectId}/studio`;
  async function refresh() { if (projectId) setData(await request<StudioState>(endpoint)); }
  useEffect(() => {
    dialog.current?.showModal();
    void waitForRuntime().then(refresh).catch(cause => setError(String(cause)));
    return () => dialog.current?.close();
  }, [projectId]);
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setError("");
    try { await action(); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  const restoration = data?.restoration;
  return <dialog ref={dialog} className="studio-center" aria-labelledby="studio-center-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><div><small>创作 · 复原 · 发布</small><h2 id="studio-center-title">{projectId ? "复原与发布中心" : "复原已有游戏"}</h2></div><button type="button" disabled={busy} onClick={onClose} aria-label="关闭">关闭</button></header>
    {!projectId ? <form onSubmit={event => { event.preventDefault(); void run(async () => {
      const result = await request<{ projectId: string }>("/studio/import", { method: "POST", body: JSON.stringify({ sourcePath: source.trim(), name, goal, storageMode }) });
      onOpen?.(result.projectId);
    }); }}>
      <p>导入客户端、APK、源码或资料。</p>
      <label>文件处理方式<select disabled={busy} value={storageMode} onChange={event => setStorageMode(event.target.value as "copy" | "in-place")}><option value="copy">保存原始副本，在工作副本中修改</option><option value="in-place">直接使用现有文件夹，不复制客户端</option></select></label>
      {storageMode === "in-place" ? <aside>将直接修改现有文件。不会创建原始快照，不提供整项目还原；保留已有角色和存档。</aside> : null}
      <label>游戏名称<input value={name} onChange={event => setName(event.target.value)} placeholder="可选，默认使用文件名" maxLength={120} /></label>
      <label onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (busy) return; try { const file = event.dataTransfer.files[0]; const selected = file && window.ohMyGameDesktop?.droppedFilePath?.(file); if (selected) setSource(selected); else setError("请使用文件选择按钮或填写本地完整路径。"); } catch { setError("无法读取拖入的路径，请使用文件选择按钮。"); } }}>本地文件或文件夹的完整路径（也可拖入）<input required value={source} onChange={event => setSource(event.target.value)} placeholder="例如 D:\Games\旧游戏 或 D:\Games\game.apk" /></label>
      {window.ohMyGameDesktop?.selectRestorationFile ? <button type="button" disabled={busy} onClick={() => void run(async () => { const selected = await window.ohMyGameDesktop?.selectRestorationFile?.(); if (selected) setSource(selected); })}>选择客户端／APK／资料文件</button> : null}
      {window.ohMyGameDesktop?.selectProjectDirectory ? <button type="button" disabled={busy} onClick={() => void run(async () => { const selected = await window.ohMyGameDesktop?.selectProjectDirectory(); if (selected) setSource(selected); })}>选择游戏文件夹</button> : null}
      <label>这次想先达到什么目标？<textarea required value={goal} maxLength={2000} onChange={event => setGoal(event.target.value)} /></label>
      <aside>当前可建立文件清单、校验副本、分析 APK 容器与工程线索。原生隔离运行器尚未接入，因此不会自动启动导入程序，也不会把解析成功标成复原成功。</aside>
      <button className="studio-primary" disabled={busy || !source.trim() || !goal.trim()}>{busy ? "正在读取与登记材料…" : "建立复原项目"}</button>
    </form> : <>
      {!data ? <p>正在读取项目记录…</p> : restoration ? <section>
        <h3>复原任务 · {restoration.sourceName}</h3><p>{restoration.goal}</p>
        <div className="studio-controls"><label>恢复路线<select disabled={busy} value={restoration.route} onChange={event => void run(() => request(`${endpoint}/restoration`, { method: "PATCH", body: JSON.stringify({ route: event.target.value }) }))}>
          <option value="repair">保留原程序，修复问题</option><option value="rebuild">重建缺失组件</option><option value="remake">基于资料重新实现</option>
        </select></label><button disabled={busy} onClick={() => void run(() => request(`${endpoint}/restoration`, { method: "PATCH", body: JSON.stringify({ state: restoration.state === "paused" ? "ready" : "paused" }) }))}>{restoration.state === "paused" ? "恢复任务" : "暂停后续任务"}</button>
        {restoration.storageMode !== "in-place" ? <button disabled={busy} onClick={() => setRollback(true)}>还原工作副本…</button> : <span>直接修改现有目录 · 无原始快照</span>}</div>
        {rollback ? <aside>将把当前工作副本移入历史目录，再从原始材料恢复。<button disabled={busy} onClick={() => void run(async () => { await request(`${endpoint}/rollback`, { method: "POST" }); setRollback(false); })}>确认还原并保留历史</button><button disabled={busy} onClick={() => setRollback(false)}>取消</button></aside> : null}
        <ol className="studio-milestones">{restoration.milestones.map(step => <li key={step.name}><b>{step.status === "done" ? "已完成" : step.status === "blocked" ? "待接入" : "待执行"} · {step.name}</b><p>{step.detail}</p></li>)}</ol>
        <details><summary>分析证据 · {restoration.files.length} 个文件</summary>{restoration.findings.map((finding, index) => <div className="studio-finding" key={index}><b>{({ confirmed: "已确认", inferred: "推测", unknown: "未知" })[finding.certainty]}</b> {finding.message}<pre>{finding.evidence.join("\n")}</pre></div>)}</details>
        <p>关闭此窗口后，可在现有 AI 对话中继续分析和修改。复原模式暂限文件读写；原生运行验证尚不可用。</p>
      </section> : <section><h3>继续创作</h3><p>沿用现有 AI 对话、素材和试玩功能。游戏构建完成后，在下方选择目标平台。</p></section>}
      <section><h3>跨平台发布</h3><p>这里导出的是你的游戏。本地导出不需要产品账号。</p>
        <div className="studio-controls"><label>目标平台<select value={target} onChange={event => setTarget(event.target.value as StudioTarget)} disabled={busy}>{Object.entries(TARGETS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>静态游戏目录（相对项目）<input value={directory} onChange={event => setDirectory(event.target.value)} disabled={busy} placeholder="dist" /></label></div>
        <aside>{target === "windows" ? "生成独立桌面工程；本机运行时可用时，同时生成 Windows 便携版。" : target === "web" ? "导出静态游戏 ZIP，可部署到自己的站点。" : target === "macos" ? "生成桌面工程；APP 构建与签名仍需 macOS 环境。" : "生成 Capacitor 输入工程，并尝试生成 Android／iOS 原生工程；安装包、触控适配和设备验证仍需后续完成。"} 目录必须包含 index.html；旧二进制不能直接转为这些平台。</aside>
        <button className="studio-primary" disabled={busy || !data || !directory.trim()} onClick={() => void run(() => request(`${endpoint}/exports`, { method: "POST", body: JSON.stringify({ target, sourceDirectory: directory }) }))}>{busy ? "正在处理…" : "生成并导出"}</button>
      </section>
      {data?.exports.length ? <section><h3>交付记录</h3>{[...data.exports].reverse().map(item => <article className="studio-export" key={item.id}><b>{TARGETS[item.target]} · {item.status === "built" ? "产物已构建" : item.nativeProject ? "原生工程已生成" : "输入工程已生成"}</b><p>运行验证：未验证 · 发布准备：未完成</p><p className="studio-path">{item.directory}</p>{window.ohMyGameDesktop?.revealStudioExport ? <button disabled={busy} onClick={() => void run(() => window.ohMyGameDesktop!.revealStudioExport!(projectId!, item.id))}>打开交付文件夹</button> : null}{item.notes.map(note => <p key={note}>{note}</p>)}{item.sha256 ? <details><summary>产物校验值</summary><code>{item.sha256}</code></details> : null}</article>)}</section> : null}
    </>}
    {error ? <p role="alert" className="studio-error">{error}</p> : null}
  </dialog>;
}
