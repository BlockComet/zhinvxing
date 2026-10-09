import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { AssetCanvasNode, ProjectState, PromptContext } from "../shared/contracts.js";
import { canvasBoardPath } from "../shared/canvas-workspace.js";
import { canvasNodeTitle } from "../shared/canvas-assets.js";
import { canvasDocumentPath } from "../shared/canvas-document.js";
import { CanvasBoardEditor } from "./asset-canvas-workspace.js";
import { createCanvasBoardStorage, type CanvasBoardConflict, type CanvasBoardStorage } from "./canvas-board-storage.js";
import { LibraryAssetPicker } from "./node-workbench.js";
import { changeCanvasBoard, createCanvasBoard, deleteCanvasBoard } from "./canvas-api.js";
import { useCanvasDocuments } from "./use-canvas-documents.js";
import { ExpandedCanvasDocument, type CanvasDocuments } from "./canvas-document-node.js";
import { Check, ChevronLeft, ChevronRight, Code2, House, Layers3, LoaderCircle, MoreHorizontal, PanelToggle, Pencil, Plus, Trash2, X } from "./icons.js";
import { CanvasChipSelect } from "./canvas-chip-select.js";
import { CanvasContextMenu } from "./editor-canvas.js";
import { loadLibraryAssets, type LibraryAsset } from "./library-assets.js";
import { CanvasAssetProvider, canvasAssetSources } from "./use-workspace-asset-url.js";
import { WorkspaceCodeView } from "./coding-workspace.js";
import { WorkspaceTabs } from "./workspace-tabs.js";
import "./game-design.css";

export function CanvasWorkspace({ project, headerActionsTarget = null, onLeaveReady, onSaveReady, onContextChange, initialNodeId, onInitialNodeHandled, workspaceRevision = 0, openFileRequest, chatOnRight, chatCollapsed, onHome, onToggleChat }: {
  project: ProjectState; headerActionsTarget?: HTMLElement | null;
  onLeaveReady?: (leave: ((action: () => void) => void) | undefined) => void;
  onSaveReady?: (save: (() => Promise<void>) | undefined) => void;
  onContextChange?: (context: PromptContext | undefined) => void;
  initialNodeId?: string;
  onInitialNodeHandled?: () => void;
  workspaceRevision?: number;
  openFileRequest?: { path: string; id: number };
  chatOnRight?: boolean;
  chatCollapsed?: boolean;
  onHome?: () => void;
  onToggleChat?: () => void;
}) {
  const singleBoard = project.type === "asset-canvas";
  const docs = useCanvasDocuments(project.id), workspace = docs.workspace;
  const assetPaths = useMemo(() => canvasAssetSources(project.id, workspace?.assets ?? [], workspace?.unavailableAssets), [project.id, workspace?.assets, workspace?.unavailableAssets]);
  const docsRef = useRef(docs); docsRef.current = docs;
  const [activeId, setActiveId] = useState<string | undefined>(() => { try { return localStorage.getItem(`canvas-active:${project.id}`) ?? undefined; } catch { return undefined; } });
  const [selectedNodes, setSelectedNodes] = useState<AssetCanvasNode[]>([]);
  const [boardConflict, setBoardConflict] = useState<CanvasBoardConflict>();
  const [boardOptions, setBoardOptions] = useState<{ id: string; x: number; y: number }>();
  const [documentId, setDocumentId] = useState<string>();
  const [dialog, setDialog] = useState<{ type: "create" | "rename" | "delete"; id?: string }>();
  const [name, setName] = useState("");
  const [insertion, setInsertion] = useState<{ documentId?: string; assetId?: string; text?: string }>();
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [boardStatus, setBoardStatus] = useState("loading");
  const [workspaceView, setWorkspaceView] = useState<"canvas" | "code">("canvas");
  const [codeRevision, setCodeRevision] = useState(0);
  const boardSave = useRef<(() => Promise<void>) | undefined>(undefined);
  const boardResolve = useRef<((version: "local" | "remote") => Promise<void>) | undefined>(undefined);
  const registerSave = useCallback((save: (() => Promise<void>) | undefined) => { boardSave.current = save; }, []);
  const registerResolve = useCallback((resolve: typeof boardResolve.current) => { boardResolve.current = resolve; }, []);
  const flush = useCallback(async () => { await boardSave.current?.(); await docsRef.current.flush(); }, []);
  const changeView = useCallback((view: "canvas" | "code") => {
    setWorkspaceView(view);
    // Keep the canvas session and drafts alive; Code stays accessible if saving fails.
    if (view === "code") void flush().then(() => setCodeRevision((value) => value + 1)).catch(() => {});
  }, [flush]);
  useEffect(() => { if (singleBoard && openFileRequest) changeView("code"); }, [singleBoard, openFileRequest?.id, changeView]);
  useEffect(() => { if (initialNodeId) setWorkspaceView("canvas"); }, [initialNodeId]);
  const run = useCallback(async <T,>(operation: () => Promise<T>) => {
    setBusy(true); setError(undefined);
    try { return await operation(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); }
  }, []);
  const leave = useCallback((action: () => void) => { void run(async () => { await flush(); action(); }); }, [run, flush]);
  useEffect(() => { onLeaveReady?.(leave); return () => onLeaveReady?.(undefined); }, [leave, onLeaveReady]);
  useEffect(() => { onSaveReady?.(flush); return () => onSaveReady?.(undefined); }, [flush, onSaveReady]);
  useEffect(() => { if (workspace && (singleBoard || !workspace.boards.some((board) => board.id === activeId))) setActiveId(workspace.boards[0]?.id); }, [workspace, activeId, singleBoard]);
  useEffect(() => { if (activeId) { try { localStorage.setItem(`canvas-active:${project.id}`, activeId); } catch { /* Board selection remains usable without storage. */ } } }, [project.id, activeId]);
  const boardName = workspace?.boards.find((board) => board.id === activeId)?.name;
  const selectionContext = JSON.stringify({ total: selectedNodes.length, nodes: selectedNodes.slice(0, 25).map((node) => ({ id: node.id, name: canvasNodeTitle(node, workspace?.documents, workspace?.assets).slice(0, 80), type: node.type, ...(node.type === "document" ? { source: canvasDocumentPath(node.data.documentId) } : {}) })) });
  useEffect(() => {
    if (singleBoard && workspaceView === "code") { onContextChange?.(undefined); return; }
    if (!activeId || !boardName) return;
    onContextChange?.({ kind: "canvas-board", label: `${singleBoard ? project.name : boardName}${selectedNodes.length ? ` (${selectedNodes.length} selected)` : ""}`.slice(0, 200), text: `Current canvas board: ${canvasBoardPath(activeId)}\nSelected nodes: ${selectionContext}\nAsset paths and descriptions: canvas/assets.json\nRead these current project files to resolve the user's references. Selected nodes identify what the message refers to; they do not limit the requested work. Read actual image files when evaluating their appearance.` });
  }, [activeId, boardName, singleBoard, workspaceView, project.name, selectionContext, onContextChange]);
  useEffect(() => { setSelectedNodes([]); }, [activeId]);
  useEffect(() => { setBoardConflict(undefined); }, [project.id, activeId]);
  useEffect(() => () => onContextChange?.(undefined), [onContextChange]);
  // Storage owns revisions and drafts; its lifetime must follow the board session,
  // not React's disposable memo cache.
  const adapterRef = useRef<CanvasBoardStorage | undefined>(undefined);
  const adapterKey = activeId ? `${project.id}:${activeId}` : undefined;
  if (adapterRef.current?.key !== adapterKey) adapterRef.current = activeId ? createCanvasBoardStorage({
    projectId: project.id, boardId: activeId,
    onConflict: (conflict) => { if (adapterRef.current?.key === adapterKey) setBoardConflict(conflict); }, flushDocuments: () => docsRef.current.flush(),
  }) : undefined;
  const adapter = adapterRef.current;
  const design: CanvasDocuments = {
    projectId: project.id, documents: workspace?.documents ?? [], documentIssues: workspace?.documentIssues,
    add: () => run(() => docsRef.current.create()),
    update: docs.update, open: setDocumentId,
    generations: docs.generations, changeGeneration: docs.changeGeneration,
    generate: (id, model, reasoningLevel) => { void docsRef.current.generate(id, model, reasoningLevel); }, applyGeneration: docs.applyGeneration,
    setMain: singleBoard ? undefined : (id) => { void run(() => docsRef.current.setMain(id)); },
    insertImage: (id, assetId) => { void run(() => docsRef.current.insertImage(id, assetId)); },
    pickImage: (id) => {
      setInsertion({ documentId: id });
      void loadLibraryAssets().then((value) => {
        const all = new Map(value.map((asset) => [asset.id, asset]));
        for (const asset of workspace?.assets ?? []) all.set(asset.id, { ...all.get(asset.libraryAssetId ?? asset.id), ...asset, assetId: asset.id });
        setAssets([...all.values()].filter((asset) => asset.mediaType === "image"));
      }).catch((cause) => setError(String(cause)));
    },
    appendImage: (assetId) => setInsertion({ assetId, documentId: workspace?.mainDocumentId ?? workspace?.documents[0]?.id }),
    appendText: (text) => setInsertion({ text, documentId: workspace?.mainDocumentId ?? workspace?.documents[0]?.id }),
  };
  const optionsBoard = workspace?.boards.find((board) => board.id === boardOptions?.id);
  const expanded = workspace?.documents.find((doc) => doc.id === documentId);
  const hasDocumentDraft = workspace?.documentIssues?.some((issue) => workspace.documents.some((doc) => doc.id === issue.id));
  const status = docs.conflict || boardConflict ? "conflict" : docs.error || boardStatus === "error" ? "error" : docs.saving || boardStatus === "saving" ? "saving" : hasDocumentDraft ? "draft" : docs.loadError ? "sync-error" : boardStatus;
  const saveStatus = <span className={`design-save-status is-${status}`} role="status">{status === "saving" ? <LoaderCircle size={12} className="spin" /> : status === "saved" ? <Check size={12} /> : null}{status === "saved" ? "已保存" : status === "saving" ? "正在保存" : status === "error" ? "保存失败" : status === "sync-error" ? "同步已暂停" : status === "load-error" ? "无法加载" : status === "conflict" ? "检查更改" : status === "draft" ? "草稿已保存在本机" : "正在加载"}</span>;
  const floating = <div className="design-board-switcher">
    <Layers3 size={13} aria-hidden="true" />
    <CanvasChipSelect label="画板" value={activeId} options={(workspace?.boards ?? []).map((board) => ({ value: board.id, label: board.name }))} disabled={busy}
      action={{ label: "新建画板", icon: Plus, onSelect: () => { setName(""); setDialog({ type: "create" }); } }}
      optionAction={{ label: (option) => `画板选项：${option.label}`, icon: MoreHorizontal, onSelect: (id, anchor) => setBoardOptions({ id, x: anchor.left, y: anchor.bottom + 5 }) }}
      onChange={(id) => void run(async () => { await flush(); setActiveId(id); setBoardStatus("loading"); })} />
  </div>;
  return <CanvasAssetProvider assets={assetPaths}><section className="viewer-pane design-workspace" data-active-tab={singleBoard ? workspaceView : undefined} aria-label={singleBoard ? "素材画布工作区" : "设计工作区"}>
    {singleBoard ? <header className="pane-header viewer-header interactive-story-header window-drag-handle">
      <span className="workspace-navigation-drag-exclusion" aria-hidden="true" />
      <div className={`viewer-navigation${chatOnRight ? " is-chat-right" : ""}`}>
        {chatOnRight && onHome ? <button className="icon-button pane-header-action workspace-home-button" type="button" onClick={onHome} title="首页" aria-label="首页"><House size={14} /></button> : null}
        <WorkspaceTabs tabs={[{ id: "canvas", label: "画布", icon: Layers3 }, { id: "code", label: "代码", icon: Code2 }]} active={workspaceView} onChange={changeView} label="工作区模式" />
      </div>
      <div className="viewer-controls-slot" />
      <div className="viewer-publish design-header-actions">
        {saveStatus}
        {chatOnRight && chatCollapsed && onToggleChat ? <button className="icon-button pane-header-action" type="button" title="显示聊天" aria-label="显示聊天" onClick={onToggleChat}><PanelToggle size={14} /></button> : null}
      </div>
    </header> : headerActionsTarget ? createPortal(saveStatus, headerActionsTarget) : null}
    {error ? <div className="design-notice" role="alert"><span>{error}</span><button type="button" onClick={() => setError(undefined)}>关闭提示</button></div> : null}
    {docs.loadError ? <div className="design-notice" role="alert"><span>{workspace ? "无法同步工作区。画布仍保持打开。 " : "无法加载工作区。 "}{docs.loadError}</span><button type="button" disabled={busy} onClick={() => void run(() => docsRef.current.refresh())}>重新加载工作区</button></div> : null}
    {docs.error && !docs.conflict ? <div className="design-notice" role="alert"><span>{docs.error}</span><button type="button" disabled={busy} onClick={() => void run(() => docsRef.current.flush())}>重新保存</button></div> : null}
    {docs.conflict ? <div className="design-notice" role="alert"><span>文档「{docs.conflict.local.title}」已在其他位置修改。草稿已保留，请选择版本以继续保存。</span><button type="button" onClick={() => docs.resolve("remote")}>使用磁盘版本</button><button type="button" onClick={() => docs.resolve("local")}>保留我的版本</button></div> : null}
    {boardConflict ? <div className="design-notice" role="alert"><span>画板已在其他位置修改。草稿已保留，请选择版本以继续保存。</span>{(["remote", "local"] as const).map((version) => <button type="button" key={version} disabled={busy || boardStatus === "loading" || boardStatus === "load-error"} onClick={() => void run(async () => {
      const resolve = boardResolve.current;
      if (!resolve) throw new Error("请先加载画布再解决冲突。");
      await resolve(version);
      setBoardConflict(undefined);
    })}>{version === "remote" ? "使用磁盘版本" : "保留我的版本"}</button>)}</div> : null}
    {workspace && adapter ? <CanvasBoardEditor key={adapter.key} project={project} hidden={singleBoard && workspaceView === "code"} storage={adapter} documents={design} assets={workspace.assets} conflicted={!!boardConflict} overlay={singleBoard ? undefined : floating} onSaveReady={registerSave} onResolveReady={registerResolve} onStatusChange={setBoardStatus} onSelectionChange={setSelectedNodes} initialNodeId={initialNodeId} onInitialNodeHandled={onInitialNodeHandled} /> : singleBoard && workspaceView === "code" ? null : <div className="design-loading">{docs.loadError ? <span>请恢复工作区文件，然后重新加载。</span> : <LoaderCircle size={22} className="spin" />}</div>}
    {singleBoard && workspaceView === "code" ? <WorkspaceCodeView projectId={project.id} revision={workspaceRevision + codeRevision} openFileRequest={openFileRequest} /> : null}
    {boardOptions && workspace && optionsBoard ? <CanvasContextMenu screenPosition={boardOptions} label={`画板选项：${optionsBoard.name}`} onClose={() => setBoardOptions(undefined)}>
      <button type="button" role="menuitem" onClick={() => { setBoardOptions(undefined); setName(optionsBoard.name); setDialog({ type: "rename", id: optionsBoard.id }); }}><Pencil size={14} /><span>重命名</span></button>
      {([-1, 1] as const).map((direction) => <button type="button" role="menuitem" key={direction} disabled={workspace.boards.findIndex((board) => board.id === optionsBoard.id) === (direction === -1 ? 0 : workspace.boards.length - 1)} onClick={() => { setBoardOptions(undefined); void run(async () => { await flush(); await changeCanvasBoard(project.id, optionsBoard.id, { direction }); await docsRef.current.refresh(); }); }}>{direction === -1 ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}<span>{direction === -1 ? "上移" : "下移"}</span></button>)}
      <button type="button" role="menuitem" disabled={workspace.boards.length === 1} onClick={() => { setBoardOptions(undefined); setDialog({ type: "delete", id: optionsBoard.id }); }}><Trash2 size={14} /><span>删除画板</span></button>
    </CanvasContextMenu> : null}
    {expanded && workspaceView !== "code" ? <div className="design-expanded-document" role="dialog" aria-modal="true" aria-label={expanded.title}>
      <ExpandedCanvasDocument design={design} document={expanded} />
      <button className="design-expanded-close" type="button" title="返回画布" aria-label="返回画布" disabled={busy} onClick={() => void run(async () => { await docsRef.current.flush(); setDocumentId(undefined); })}><X size={16} /></button>
    </div> : null}
    {dialog ? <DesignModal title={dialog.type === "create" ? "新建画板" : dialog.type === "rename" ? "重命名画板" : "删除画板"} onClose={() => { if (!busy) setDialog(undefined); }}>
      <form onSubmit={(event) => { event.preventDefault(); void run(async () => {
        await flush();
        let createdId: string | undefined;
        if (dialog.type === "create") { const next = await createCanvasBoard(project.id, name.trim()); createdId = next.boards.at(-1)!.id; }
        else if (dialog.type === "rename") await changeCanvasBoard(project.id, dialog.id!, { name: name.trim() });
        else await deleteCanvasBoard(project.id, dialog.id!);
        await docsRef.current.refresh();
        if (createdId) setActiveId(createdId);
        setDialog(undefined);
      }); }}>
        {dialog.type === "delete" ? <p>删除「{workspace?.boards.find((board) => board.id === dialog.id)?.name}」？文档和素材库内容将保留。</p> : <label>名称<input autoFocus required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>}
        <footer><button type="button" disabled={busy} onClick={() => setDialog(undefined)}>取消</button><button type="submit" disabled={busy || (dialog.type !== "delete" && !name.trim())}>{dialog.type === "delete" ? "删除" : "保存"}</button></footer>
      </form>
    </DesignModal> : null}
    {insertion?.documentId && !insertion.assetId && insertion.text === undefined ? <LibraryAssetPicker title="插入图片" assets={assets} onClose={() => { if (!busy) setInsertion(undefined); }} onSelect={(asset) => void run(async () => { await docsRef.current.insertImage(insertion.documentId!, asset.id); setInsertion(undefined); })} /> : insertion ? <DesignModal title={insertion.text ? "向文档添加文本" : "插入图片"} onClose={() => { if (!busy) setInsertion(undefined); }}>
      <form onSubmit={(event) => { event.preventDefault(); void run(async () => {
        if (!insertion.documentId) return;
        if (insertion.text !== undefined) { const doc = docsRef.current.workspace?.documents.find((doc) => doc.id === insertion.documentId); if (!doc) throw new Error("找不到文档"); docsRef.current.update(doc.id, { markdown: `${doc.markdown.trimEnd()}\n\n${insertion.text}\n` }); await docsRef.current.flush(); }
        else if (insertion.assetId) await docsRef.current.insertImage(insertion.documentId, insertion.assetId);
        setInsertion(undefined);
      }); }}>
        <label>文档<select required value={insertion.documentId ?? ""} onChange={(event) => setInsertion({ ...insertion, documentId: event.target.value })}><option value="" disabled>选择文档</option>{workspace?.documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.title}</option>)}</select></label>
        {insertion.text !== undefined ? <pre className="design-insert-text">{insertion.text}</pre> : null}
        <footer><button type="button" disabled={busy} onClick={() => setInsertion(undefined)}>取消</button><button type="submit" disabled={busy || !insertion.documentId || (insertion.text === undefined && !insertion.assetId)}>插入</button></footer>
      </form>
    </DesignModal> : null}
  </section></CanvasAssetProvider>;
}
function DesignModal({ title, children, onClose }: { title: string; children: ReactNode; onClose(): void }) {
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [onClose]);
  return createPortal(<div className="design-modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="design-modal" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button type="button" title="关闭" aria-label="关闭" onClick={onClose}><X size={16} /></button></header>{children}</section></div>, document.body);
}
