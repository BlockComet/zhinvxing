import { useLayoutEffect, useRef, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import type { CanvasWorkspaceDetail } from "../shared/canvas-workspace.js";
import type { AgentModelRef, AgentReasoningLevel } from "../shared/contracts.js";
import type { CanvasMarkdownDocument } from "../shared/canvas-document.js";
import { Check, Columns2, Copy, Download, Eye, FileText, Image as ImageIcon, Maximize, MoreHorizontal, Pencil, X } from "./icons.js";
import { CanvasTextarea, CanvasTextInput, CanvasTextComposer, type CanvasTextModels } from "./canvas-text-composer.js";
import { CanvasContextMenu } from "./editor-canvas.js";
import { CanvasNodeLabel, type CanvasNodeDetails } from "./canvas-node-label.js";
import { useAgentModels } from "./model-selector.js";
import type { DocumentGenerationState } from "./use-canvas-documents.js";
import { MarkdownContent } from "./markdown-content.js";
import { useWorkspaceAssetUrl } from "./use-workspace-asset-url.js";

export interface CanvasDocuments {
  projectId: string;
  documents: CanvasWorkspaceDetail["documents"];
  documentIssues?: CanvasWorkspaceDetail["documentIssues"];
  add(): Promise<string | undefined>;
  update(id: string, patch: Partial<Pick<CanvasMarkdownDocument, "title" | "markdown">>): void;
  open(id: string): void;
  setMain?: (id: string) => void;
  insertImage(id: string, assetId: string): void;
  pickImage(id: string): void;
  appendImage(assetId: string): void;
  appendText(text: string): void;
  generations: Record<string, DocumentGenerationState>;
  changeGeneration(id: string, patch: Partial<DocumentGenerationState>): void;
  generate(id: string, model: AgentModelRef, reasoningLevel?: AgentReasoningLevel): void;
  applyGeneration(id: string): void;
}
export interface DocumentNodeRuntime extends CanvasTextModels { design: CanvasDocuments; document?: CanvasWorkspaceDetail["documents"][number] }
export function CanvasDocumentNode({ data, selected }: { data: { documentId?: string; documentRuntime?: DocumentNodeRuntime; nodeDetails?: CanvasNodeDetails }; selected?: boolean }) {
  const [editing, setEditing] = useState(() => !data.documentRuntime?.document?.markdown);
  const bodyRef = useRef<HTMLDivElement>(null);
  const scrollProgress = useRef(0);
  const isEditing = !!selected && editing;
  const runtime = data.documentRuntime, doc = runtime?.document;
  const issue = runtime?.design.documentIssues?.find((issue) => issue.id === data.documentId);
  useLayoutEffect(() => {
    const pane = bodyRef.current?.querySelector<HTMLElement>(isEditing ? "textarea" : ".design-document-node-preview");
    if (pane) pane.scrollTop = scrollProgress.current * Math.max(0, pane.scrollHeight - pane.clientHeight);
  }, [isEditing]);
  return <div className={`story-node story-text-node design-document-node${selected ? " is-selected" : ""}`}>
    <div className="story-text-output">
      <div data-alignment-frame className="design-document-node-content">
        <CanvasNodeLabel icon={FileText} label={doc?.title ?? issue?.title ?? "文档缺失"} details={data.nodeDetails} className="design-document-node-header"
          titleEditor={isEditing && doc ? <CanvasTextInput className="nodrag" aria-label="文档标题" value={doc.title} maxLength={200} onChange={(title) => runtime?.design.update(doc.id, { title })} /> : undefined} />
        {issue ? <div className="design-document-issue" role="status">文档不可用： {issue.source}{doc ? "。未保存的草稿已保留。" : "。恢复文件后可重新加载。"}</div> : null}
        {doc ? <div ref={bodyRef} className={`design-document-node-body nowheel${isEditing ? " nodrag" : " is-preview"}`} onScrollCapture={(event) => {
          const pane = event.target as HTMLElement;
          if (pane.parentElement !== bodyRef.current || pane.hidden) return;
          const range = pane.scrollHeight - pane.clientHeight;
          scrollProgress.current = range > 0 ? pane.scrollTop / range : 0;
        }} onMouseDown={(event) => {
          if ((event.target as HTMLElement).closest("a, button, input")) event.stopPropagation();
        }} onTouchStart={(event) => {
          if ((event.target as HTMLElement).closest("a, button, input")) event.stopPropagation();
        }}>
          <CanvasTextarea hidden={!isEditing} spellCheck={false} aria-label="文档 Markdown" value={doc.markdown} onChange={(markdown) => runtime?.design.update(doc.id, { markdown })} />
          <div hidden={isEditing} className="design-document-node-preview"><CanvasMarkdown projectId={runtime!.design.projectId} document={doc} /></div>
        </div> : <div className="design-document-node-body">找不到文档</div>}
        <Handle type="target" position={Position.Left} id="image" />
        <Handle type="source" position={Position.Right} id="out" />
      </div>
      {selected && doc ? <footer className="design-document-node-footer nodrag nowheel">
        <div className="design-mode-control" role="group" aria-label="文档视图">
          <button type="button" title="编辑 Markdown" aria-label="编辑 Markdown" aria-pressed={editing} onClick={() => setEditing(true)}><Pencil size={14} /></button>
          <button type="button" title="预览文档" aria-label="预览文档" aria-pressed={!editing} onClick={() => setEditing(false)}><Eye size={14} /></button>
        </div>
        <div className="design-document-node-actions">
          <button type="button" title="从素材库插入图片" aria-label="从素材库插入图片" onClick={() => runtime?.design.pickImage(doc.id)}><ImageIcon size={14} /></button>
          <button type="button" title="展开文档" aria-label="展开文档" onClick={() => runtime?.design.open(doc.id)}><Maximize size={14} /></button>
        </div>
      </footer> : null}
    </div>
    {selected && doc && runtime ? <CanvasDocumentAI design={runtime.design} document={doc} textModels={runtime} /> : null}
  </div>;
}
export function CanvasMarkdown({ projectId, document }: { projectId: string; document: CanvasMarkdownDocument }) {
  return <MarkdownContent text={document.markdown} renderImage={(src, alt) => <CanvasImage projectId={projectId} documentId={document.id} src={src} alt={alt} />} />;
}
export function canvasImagePath(documentId: string, src?: string): string | undefined {
  if (!src || /^[a-z][a-z\d+.-]*:|^\/\//i.test(src)) return undefined;
  try {
    const url = new URL(src, `https://workspace/canvas/documents/${documentId}.md`);
    const pathname = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    if (pathname.split("/").some((part) => part === "..") || pathname.includes("\\")) return undefined;
    return pathname;
  } catch { return undefined; }
}
function CanvasImage({ projectId, documentId, src, alt }: { projectId: string; documentId: string; src?: string; alt?: string }) {
  const file = canvasImagePath(documentId, src);
  const { url, error, loading, retry } = useWorkspaceAssetUrl(file ? projectId : undefined, file ?? "");
  const remote = src && /^https?:\/\//i.test(src) ? src : undefined;
  return url || remote ? <img src={url ?? remote} alt={alt ?? ""} loading="lazy" draggable={false} /> : <span className="design-image-placeholder" title={error}>{error ? `图片不可用：${file}` : alt || "图片"}{error ? <button className="nodrag" type="button" disabled={loading} onClick={retry}>再次检查</button> : null}</span>;
}
export function CanvasDocumentAI({ design, document, textModels }: { design: CanvasDocuments; document: CanvasMarkdownDocument; textModels: CanvasTextModels }) {
  const state = design.generations[document.id];
  const [preview, setPreview] = useState(false);
  const [copyResult, setCopyResult] = useState<{ draft: string; message: string }>();
  const busy = state?.generating || state?.applying;
  return <>
    <CanvasTextComposer {...textModels} instruction={state?.instruction ?? ""} model={state?.model} reasoningLevel={state?.reasoningLevel} generating={state?.generating}
      busy={busy} error={state?.error} label="文档生成指令" placeholder="描述要编写或修改的内容" generateLabel={state?.error || state?.proposal !== undefined ? "重新生成文档" : "生成文档"}
      onInstruction={(instruction) => design.changeGeneration(document.id, { instruction, error: undefined })}
      onModel={(model, reasoningLevel) => design.changeGeneration(document.id, { model, reasoningLevel, error: undefined })}
      onReasoningChange={(reasoningLevel) => design.changeGeneration(document.id, { model: state?.model ?? textModels.defaultModel, reasoningLevel, error: undefined })}
      onGenerate={(model, reasoningLevel) => design.generate(document.id, model, reasoningLevel)} />
    {state?.proposal !== undefined ? <section className="design-ai-result nodrag nowheel" aria-label="AI 候选草稿">
      <p className="design-ai-result-status" role="status">{state.proposalStatus === "incomplete" ? "草稿尚未完成，请检查后再替换文档。" : "候选草稿，请检查后再替换文档。"}</p>
      <div className="design-mode-control" role="group" aria-label="候选草稿视图">
        <button type="button" title="编辑候选草稿" aria-label="编辑候选草稿" aria-pressed={!preview} onClick={() => setPreview(false)}><Pencil size={14} /></button>
        <button type="button" title="预览候选草稿" aria-label="预览候选草稿" aria-pressed={preview} onClick={() => setPreview(true)}><Eye size={14} /></button>
      </div>
      {preview ? <div className="design-ai-result-preview"><CanvasMarkdown projectId={design.projectId} document={{ ...document, markdown: state.proposal }} /></div>
        : <CanvasTextarea aria-label="候选草稿 Markdown" spellCheck={false} rows={7} value={state.proposal} disabled={busy} onChange={(proposal) => design.changeGeneration(document.id, { proposal })} />}
      {copyResult?.draft === state.proposal ? <p role="status">{copyResult.message}</p> : null}
      <footer>
        <button type="button" title="复制候选草稿" aria-label="复制候选草稿" onClick={async () => {
          const draft = state.proposal!;
          try { await navigator.clipboard.writeText(draft); setCopyResult({ draft, message: "草稿已复制。" }); }
          catch { setCopyResult({ draft, message: "无法复制。请选中草稿文本并手动复制。" }); }
        }}><Copy size={14} /><span>复制</span></button>
        <button type="button" title="丢弃候选草稿" aria-label="丢弃候选草稿" disabled={busy} onClick={() => design.changeGeneration(document.id, { proposal: undefined, proposalStatus: undefined, error: undefined })}><X size={14} /><span>丢弃</span></button>
        <button type="button" title="用草稿替换文档" aria-label="用草稿替换文档" disabled={busy || !state.proposal.trim()} onClick={() => design.applyGeneration(document.id)}><Check size={14} /><span>{state.applying ? "正在保存…" : "使用草稿"}</span></button>
      </footer>
    </section> : null}
  </>;
}
export function ExpandedCanvasDocument({ design, document }: { design: CanvasDocuments; document: CanvasWorkspaceDetail["documents"][number] }) {
  const [mode, setMode] = useState<"edit" | "split" | "preview">("split");
  const [menu, setMenu] = useState<{ x: number; y: number }>();
  const catalog = useAgentModels();
  return <>
    <header className="design-expanded-toolbar">
      <FileText size={16} />
      <CanvasTextInput aria-label="展开的文档标题" value={document.title} maxLength={200} onChange={(title) => design.update(document.id, { title })} />
      <div className="design-mode-control" role="group" aria-label="文档视图">
        {([ ["edit", Pencil, "编辑 Markdown"], ["split", Columns2, "分栏视图"], ["preview", Eye, "预览文档"] ] as const).map(([value, Icon, label]) => <button key={value} type="button" title={label} aria-label={label} aria-pressed={mode === value} onClick={() => setMode(value)}><Icon size={15} /></button>)}
      </div>
      <button type="button" title="从素材库插入图片" aria-label="从素材库插入图片" onClick={() => design.pickImage(document.id)}><ImageIcon size={15} /></button>
      <button type="button" title="下载 Markdown" aria-label="下载 Markdown" onClick={() => {
        const url = URL.createObjectURL(new Blob([document.markdown], { type: "text/markdown" })), link = window.document.createElement("a");
        link.href = url; link.download = `${document.title || "document"}.md`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}><Download size={15} /></button>
      {design.setMain ? <button type="button" title="文档选项" aria-label="文档选项" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setMenu({ x: rect.left, y: rect.bottom + 5 }); }}><MoreHorizontal size={15} /></button> : null}
    </header>
    <div className={`design-expanded-body is-${mode}`}>
      {mode !== "preview" ? <CanvasTextarea spellCheck={false} aria-label="展开的文档 Markdown" value={document.markdown} onChange={(markdown) => design.update(document.id, { markdown })} /> : null}
      {mode !== "edit" ? <div className="design-expanded-preview"><CanvasMarkdown projectId={design.projectId} document={document} /></div> : null}
    </div>
    <div className="design-expanded-ai"><CanvasDocumentAI design={design} document={document} textModels={{ models: catalog.models, modelStatus: catalog.status, defaultModel: catalog.defaultModel ?? catalog.models[0], defaultReasoningLevel: catalog.defaultReasoningLevel }} /></div>
    {menu ? <CanvasContextMenu screenPosition={menu} label="文档选项" onClose={() => setMenu(undefined)}>
      <button type="button" role="menuitem" disabled={document.main} onClick={() => { design.setMain?.(document.id); setMenu(undefined); }}><Check size={14} /><span>{document.main ? "主设计文档" : "设为主设计文档"}</span></button>
    </CanvasContextMenu> : null}
  </>;
}
