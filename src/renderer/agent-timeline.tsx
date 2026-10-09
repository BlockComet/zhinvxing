import {
  Check,
  ChevronRight,
  Copy,
  Diskette,
  FilePenLine,
  FileText,
  Gamepad2,
  Image,
  LoaderCircle,
  Pencil,
  Plug,
  Search,
  Terminal,
  Wrench,
  WandSparkles,
  Wifi,
  WifiOff,
  X,
  type IconComponent,
} from "./icons.js";
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import type { ConversationAttachment, PromptContextLabel, PromptImage, ThreadItem, ThreadItemError, ToolArtifact, Turn as ThreadTurn } from "../shared/contracts.js";
import { getWorkspaceAsset } from "./api.js";
import { ConversationImage } from "./image-attachments.js";
import { useNearViewport } from "./asset-gallery.js";
import { mcpToolBrand, mcpToolLabel } from "./mcp-tool-presentation.js";
import { ModelPreview } from "./model-preview.js";
import { formatBytes } from "./format-bytes.js";
import { toolGroupSummary, type ToolItem } from "./work-items.js";
import { mergeCompletedCompactionTurns, projectTurnDisplay, type TurnDisplay } from "./turn-display.js";
import { SelectedTextMenu } from "./selected-text-menu.js";
import { PromptContextIcon } from "./chat-reference.js";
import { GodotIcon } from "./godot-icon.js";
import { MarkdownContent } from "./markdown-content.js";
import { LazyDetails } from "./lazy-details.js";

type ToolCallItem = Extract<ThreadItem, { type: "dynamicToolCall" | "mcpToolCall" }>;

interface AgentTimelineProps {
  turns: ThreadTurn[];
  projectId?: string;
  workspacePath?: string;
  onOpenWorkspaceFile?: (path: string) => void;
  revisionDisabled?: boolean;
  onRevise?: (prompt: string) => Promise<boolean>;
  onAddToChat?: (text: string) => void;
  waitingForInput?: boolean;
}

const WorkspaceLinkContext = createContext<{ workspacePath?: string; onOpenWorkspaceFile?: (path: string) => void }>({});
const completedDisplays = new WeakMap<ThreadTurn, TurnDisplay>();

function turnDisplay(turn: ThreadTurn): TurnDisplay {
  if (turn.status === "inProgress") return projectTurnDisplay(turn);
  let display = completedDisplays.get(turn);
  if (!display) { display = projectTurnDisplay(turn); completedDisplays.set(turn, display); }
  return display;
}

export const AgentTimeline = memo(function AgentTimeline({ turns: sourceTurns, projectId = "", workspacePath, onOpenWorkspaceFile, revisionDisabled, onRevise, onAddToChat, waitingForInput = false }: AgentTimelineProps) {
  const [selectionRoot, setSelectionRoot] = useState<HTMLDivElement | null>(null);
  const [editingItemId, setEditingItemId] = useState<string>();
  const [draft, setDraft] = useState("");
  const [copiedItemId, setCopiedItemId] = useState<string>();
  const [copiedAssistantId, setCopiedAssistantId] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const turns = useMemo(() => mergeCompletedCompactionTurns(sourceTurns), [sourceTurns]);
  const displays = useMemo(() => turns.map(turnDisplay), [turns]);
  const workspaceLinks = useMemo(() => ({ workspacePath, onOpenWorkspaceFile }), [workspacePath, onOpenWorkspaceFile]);
  const activeIndex = turns.findIndex((turn) => turn.status === "inProgress");
  const latestSteeringIndex = turns.findLastIndex((turn) => turn.steering);
  const steeringPending = activeIndex >= 0 && latestSteeringIndex > activeIndex;
  const latestUserId = [...turns].reverse().flatMap((turn) => turn.items).find((item) => item.type === "userMessage")?.id;
  const latestAssistantId = displays
    .flatMap((display) => display.finalMessages)
    .findLast((item) => item.status === "completed" && Boolean(item.text.trim()))
    ?.id;
  useEffect(() => {
    if (editingItemId && editingItemId !== latestUserId) setEditingItemId(undefined);
  }, [editingItemId, latestUserId]);

  const copy = useCallback(async (item: Extract<ThreadItem, { type: "userMessage" }>) => {
    if (!item.text) return;
    try {
      await navigator.clipboard.writeText(item.text);
    } catch {
      return;
    }
    setCopiedItemId(item.id);
    window.setTimeout(() => setCopiedItemId((current) => current === item.id ? undefined : current), 1_500);
  }, []);

  const copyAssistant = useCallback(async (id: string, text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopiedAssistantId(id);
    window.setTimeout(() => setCopiedAssistantId((current) => current === id ? undefined : current), 1_500);
  }, []);

  const edit = useCallback((item: Extract<ThreadItem, { type: "userMessage" }>) => {
    setEditingItemId(item.id);
    setDraft(item.text);
  }, []);
  const cancelEdit = useCallback(() => setEditingItemId(undefined), []);

  const submitRevision = useCallback(async () => {
    if (!onRevise || submitting || revisionDisabled || !draft.trim()) return;
    setSubmitting(true);
    try {
      if (await onRevise(draft)) setEditingItemId(undefined);
    } finally {
      setSubmitting(false);
    }
  }, [onRevise, submitting, revisionDisabled, draft]);

  return (
    <WorkspaceLinkContext.Provider value={workspaceLinks}>
      <div className="agent-timeline-selection-root" ref={setSelectionRoot}>
        {turns.map((turn, index) => (
          <Turn
            key={turn.id}
            projectId={projectId}
            turn={turn}
            waitingForInput={turn.status === "inProgress" && waitingForInput}
            steeringPending={steeringPending && index === latestSteeringIndex}
            assistantControls={{
              copiedItemId: copiedAssistantId,
              latestItemId: latestAssistantId,
              onCopy: copyAssistant,
            }}
            userControls={{
              editing: displays[index].user?.id === editingItemId && editingItemId === latestUserId,
              draft: displays[index].user?.id === editingItemId ? draft : "",
              copied: displays[index].user?.id === copiedItemId,
              canEdit: Boolean(onRevise && displays[index].user?.text && displays[index].user?.id === latestUserId),
              disabled: Boolean(revisionDisabled || submitting),
              onCopy: copy,
              onEdit: edit,
              onDraftChange: setDraft,
              onCancel: cancelEdit,
              onSubmit: submitRevision,
            }}
          />
        ))}
        {onAddToChat ? <SelectedTextMenu root={selectionRoot} onAdd={onAddToChat} /> : null}
      </div>
    </WorkspaceLinkContext.Provider>
  );
});

interface UserControls {
  editing: boolean;
  copied: boolean;
  canEdit: boolean;
  disabled: boolean;
  draft: string;
  onCopy: (item: Extract<ThreadItem, { type: "userMessage" }>) => void;
  onEdit: (item: Extract<ThreadItem, { type: "userMessage" }>) => void;
  onDraftChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

interface AssistantControls {
  copiedItemId?: string;
  latestItemId?: string;
  onCopy: (id: string, text: string) => void;
}

const Turn = memo(function Turn({ turn, projectId, waitingForInput, steeringPending = false, userControls, assistantControls }: {
  turn: ThreadTurn;
  projectId: string;
  waitingForInput: boolean;
  steeringPending?: boolean;
  userControls: UserControls;
  assistantControls: AssistantControls;
}) {
  const [now, setNow] = useState(Date.now());
  const active = turn.status === "inProgress";
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [active]);
  const display = useMemo(() => active ? projectTurnDisplay(turn, now, waitingForInput) : turnDisplay(turn), [turn, active, now, waitingForInput]);
  return (
    <article className="agent-turn">
      <UserInput item={display.user} controls={userControls} />
      {display.status === "inProgress" ? <ActiveWork display={display} now={now} /> : null}
      {display.status !== "inProgress" && (display.work.length > 0 || display.status === "cancelled") ? <CompletedWork display={display} /> : null}
      {display.messages.map((item) => <TimelineItem key={item.id} item={item} />)}
      {display.finalMessages.length > 0
        ? <FinalResponse projectId={projectId} items={display.finalMessages} artifacts={display.artifacts} controls={assistantControls} />
        : display.artifacts.length > 0 ? <ArtifactPreviews projectId={projectId} artifacts={display.artifacts} /> : null}
      {steeringPending ? <SteeringActivity /> : null}
    </article>
  );
}, (previous, next) => previous.turn === next.turn && previous.projectId === next.projectId &&
  previous.waitingForInput === next.waitingForInput && previous.steeringPending === next.steeringPending &&
  equalControls(previous.userControls, next.userControls) && equalControls(previous.assistantControls, next.assistantControls));

function equalControls<T extends object>(previous: T, next: T): boolean {
  return (Object.keys(previous) as (keyof T)[]).every((key) => previous[key] === next[key]);
}

function SteeringActivity() {
  return (
    <div className="thinking-activity" role="status">
      <ShimmerText text="等待调整方向" />
    </div>
  );
}

function FinalResponse({ projectId, items, artifacts, controls }: {
  projectId: string;
  items: Extract<ThreadItem, { type: "agentMessage" }>[];
  artifacts: ToolArtifact[];
  controls: AssistantControls;
}) {
  const copyable = items.filter((item) => item.status === "completed" && Boolean(item.text.trim()));
  const responseId = copyable.at(-1)?.id;
  const text = copyable.map((item) => item.text).join("\n\n");
  const timestamp = copyable.at(-1)?.timestamp;
  return (
    <div className={`assistant-response${responseId === controls.latestItemId ? " assistant-response-latest" : ""}`}>
      {items.map((item) => <TimelineItem key={item.id} item={item} />)}
      {artifacts.length > 0 ? <ArtifactPreviews projectId={projectId} artifacts={artifacts} /> : null}
      {responseId ? (
        <div className="assistant-response-footer">
          <button type="button" aria-label="复制回复" title="复制" onClick={() => controls.onCopy(responseId, text)}>
            {responseId === controls.copiedItemId ? <Check size={13} /> : <Copy size={13} />}
          </button>
          {timestamp ? <time dateTime={new Date(timestamp).toISOString()}>{formatResponseTime(timestamp)}</time> : null}
        </div>
      ) : null}
    </div>
  );
}

function formatResponseTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function UserInput({ item, controls }: { item: Extract<ThreadItem, { type: "userMessage" }> | undefined; controls: UserControls }) {
  if (!item) return null;
  const visualAttachmentNames = new Set(item.images?.map((image) => image.name).filter((name): name is string => Boolean(name)) ?? []);
  const attachments = item.attachments?.filter((attachment) => !visualAttachmentNames.has(attachment.relativePath)) ?? [];
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    controls.onSubmit();
  }
  return (
    <div className="user-input">
      {item.images?.length ? (
        <div className="user-message-images">
          {item.images.map((image, index) => <ConversationImage key={`${image.mediaType}:${index}`} image={image} alt={`附件图片 ${index + 1}`} />)}
        </div>
      ) : null}
      {attachments.length ? <UserAttachments attachments={attachments} /> : null}
      {item.contexts?.length ? <UserContexts contexts={item.contexts} /> : null}
      {controls.editing ? (
        <div className="user-message-editor">
          <textarea
            autoFocus
            value={controls.draft}
            onChange={(event) => controls.onDraftChange(event.target.value)}
            onFocus={(event) => {
              const end = event.currentTarget.value.length;
              event.currentTarget.setSelectionRange(end, end);
            }}
            onKeyDown={keyDown}
            disabled={controls.disabled}
            aria-label="编辑消息"
          />
          <div className="user-message-editor-actions">
            <button type="button" onClick={controls.onCancel} disabled={controls.disabled}>取消</button>
            <button className="primary" type="button" onClick={controls.onSubmit} disabled={controls.disabled || !controls.draft.trim()}>发送</button>
          </div>
        </div>
      ) : item.text ? (
        <>
          <div className="user-message">{item.text}</div>
          <div className="user-message-actions">
            <button type="button" aria-label="复制消息" title="复制" onClick={() => controls.onCopy(item)}>
              {controls.copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
            {controls.canEdit ? (
              <button type="button" aria-label="编辑消息" title="编辑" onClick={() => controls.onEdit(item)} disabled={controls.disabled}>
                <Pencil size={13} />
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function UserContexts({ contexts }: { contexts: PromptContextLabel[] }) {
  return <div className="user-message-contexts" aria-label="编辑器上下文">
    {contexts.map((context, index) => <div className="user-message-context" key={`${context.kind}:${index}`} title={context.label}>
      <PromptContextIcon kind={context.kind} />
      <span>{context.label}</span>
    </div>)}
  </div>;
}

function UserAttachments({ attachments }: { attachments: ConversationAttachment[] }) {
  return <div className="user-message-attachments" aria-label="附件">
    {attachments.map((attachment, index) => <div className="user-message-attachment" key={`${attachment.relativePath}:${index}`} title={`${attachment.relativePath} · ${formatBytes(attachment.size)}`}>
      <FileText size={13} />
      <span>{attachment.relativePath}</span>
      <small>{attachment.kind}</small>
    </div>)}
  </div>;
}

function ShimmerText({ text, active = true, className, title, role }: {
  text: string;
  active?: boolean;
  className?: string;
  title?: string;
  role?: "status";
}) {
  const classes = [className, active ? "activity-shimmer" : undefined].filter(Boolean).join(" ") || undefined;
  return (
    <span className={classes} title={title} role={role}>
      {text}
      {active ? <span className="activity-shimmer-highlight" aria-hidden="true">{text}</span> : null}
    </span>
  );
}

function ActiveWork({ display, now }: { display: TurnDisplay; now: number }) {
  const label = display.working ? `已工作 ${activeTurnDuration(display, now)}` : "思考中";
  return (
    <section className="work-activity work-activity-active">
      <div className={`work-summary work-summary-active${display.working ? "" : " work-summary-thinking"}`}>
        <ShimmerText text={label} active={!display.working} />
      </div>
      {display.work.length > 0 ? (
        <div className="active-work-items">
          <WorkItems items={display.work} images={display.user?.images} />
        </div>
      ) : null}
    </section>
  );
}

function CompletedWork({ display }: { display: TurnDisplay }) {
  if (display.status === "completed" && !display.user && display.finalMessages.length === 0 && display.messages.length === 0 && display.work.length > 0 &&
    display.work.every((item) => item.kind === "item" && item.item.type === "contextCompaction")) {
    return <WorkItems items={display.work} />;
  }
  const content = <div className="work-items">
    <WorkItems items={display.work} images={display.user?.images} failed={display.status === "failed"} />
    {display.status === "cancelled" && display.work.length === 0 ? (
      <div className="stopped-work-note">{display.hadThinking ? "已停止思考" : "已在开始前停止"}</div>
    ) : null}
  </div>;
  if (display.status === "cancelled" || display.status === "failed") {
    return (
      <section className={`work-activity ${display.status === "cancelled" ? "work-activity-stopped" : "work-activity-failed"}`}>
        <div className={`work-summary ${display.status === "cancelled" ? "work-summary-stopped" : "work-summary-failed"}`}>
          <span>{display.status === "cancelled" ? `已停止，用时 ${turnDuration(display)}` : `用时 ${turnDuration(display)}`}</span>
        </div>
        {content}
      </section>
    );
  }
  return (
    <LazyDetails className="work-activity" summary={
      <summary className="work-summary">
        <span>用时 {turnDuration(display)}</span>
        <ChevronRight className="work-chevron" size={13} />
      </summary>}>
      {content}
    </LazyDetails>
  );
}

function WorkItems({ items, images, failed = false }: { items: TurnDisplay["work"]; images?: PromptImage[]; failed?: boolean }) {
  const rendered = items.map((item) => {
    if (item.kind === "tool-group") return <ToolActivityGroup key={item.id} tools={item.tools} thinking={item.thinking} />;
    if (item.kind === "thinking") return <ThinkingActivity key={item.id} />;
    return <TimelineItem
      key={item.item.id}
      item={item.item}
      images={item.item.type === "imageRead" ? images : undefined}
      hideError={item.item.type === "agentMessage" && Boolean(item.item.error)}
    />;
  });
  if (failed) {
    const hasFailedRetry = items.some((item) => item.kind === "item" && item.item.type === "retry" && item.item.status === "failed");
    const error = items.flatMap((item) => item.kind === "item" && item.item.type === "agentMessage" && item.item.error ? [item.item] : []).at(-1);
    if (!hasFailedRetry && error?.type === "agentMessage" && error.error) {
      rendered.push(<ConnectionActivity key="turn-connection-error" title="连接错误" error={error.error} failed />);
    }
  }
  return rendered;
}

function ToolActivityGroup({ tools, thinking }: { tools: ToolItem[]; thinking: boolean }) {
  const runningTool = tools.findLast((tool) => tool.status === "preparing" || tool.status === "inProgress");
  const runningPresentation = runningTool ? toolPresentation(runningTool) : undefined;
  const Icon = runningPresentation?.icon ?? toolGroupIcon(tools);
  const runningLabel = runningTool && runningPresentation ? runningToolGroupLabel(runningTool, runningPresentation.label) : undefined;
  const showThinking = thinking && !runningTool;
  const summaryLabel = showThinking ? "思考中" : runningLabel ?? toolGroupSummary(tools);
  return (
    <LazyDetails className="tool-activity-group" summary={
      <summary className={`tool-group-summary${showThinking ? " tool-group-summary-thinking" : ""}`}>
        {showThinking ? null : <Icon size={13} aria-hidden="true" />}
        <ShimmerText text={summaryLabel} active={Boolean(runningTool || showThinking)} className="tool-label" title={summaryLabel} role={showThinking ? "status" : undefined} />
        <ChevronRight className="tool-group-chevron" size={13} aria-hidden="true" />
      </summary>}>
      <div className="tool-group-items">
        {tools.map((tool) => <ToolActivity key={tool.id} item={tool} completed={tool.status === "completed" || tool.status === "failed"} />)}
      </div>
    </LazyDetails>
  );
}

type ToolIcon = IconComponent | typeof GodotIcon;

function toolGroupIcon(tools: ToolItem[]): ToolIcon {
  if (tools.some((tool) => tool.type === "dynamicToolCall" && tool.tool === "generate_image")) return WandSparkles;
  if (tools.some((tool) => tool.type === "dynamicToolCall" && (tool.tool === "edit" || tool.tool === "write"))) return FilePenLine;
  if (tools.some((tool) => tool.type === "dynamicToolCall" && (tool.tool === "read" || tool.tool === "ls"))) return FileText;
  if (tools.some((tool) => tool.type === "dynamicToolCall" && (tool.tool === "grep" || tool.tool === "find"))) return Search;
  if (tools.some((tool) => tool.type === "dynamicToolCall" && tool.tool === "bash")) return Terminal;
  if (tools.some((tool) => tool.type === "dynamicToolCall" && tool.tool === "game_use")) return Gamepad2;
  const mcpCalls = tools.filter((tool): tool is Extract<ToolItem, { type: "mcpToolCall" }> => tool.type === "mcpToolCall");
  if (mcpCalls.some((call) => mcpToolBrand(call) === "godot")) return GodotIcon;
  if (mcpCalls.length > 0) return Plug;
  return Wrench;
}

function turnDuration(display: TurnDisplay): string {
  return formatRoundedDuration(display.durationMs);
}

function formatRoundedDuration(milliseconds: number): string {
  if (milliseconds < 1_000) return "0s";
  const seconds = Math.max(1, Math.round(milliseconds / 1_000));
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

function activeTurnDuration(display: TurnDisplay, now: number): string {
  const workTimestamps = display.work.flatMap((item) => {
    if (item.kind === "item") return [item.item.timestamp];
    if (item.kind === "tool-group") return item.tools.map((tool) => tool.timestamp);
    return [];
  });
  const startedAt = [display.user?.timestamp, ...workTimestamps]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .reduce((earliest, value) => Math.min(earliest, value), now);
  return formatDuration(Math.max(0, now - startedAt));
}

function compactionStats(tokensBefore: number, estimatedTokensAfter?: number): string {
  const formatter = new Intl.NumberFormat();
  const before = formatter.format(tokensBefore);
  return estimatedTokensAfter === undefined
    ? `Compacted from ${before} tokens`
    : `Compacted from ${before} to approximately ${formatter.format(estimatedTokensAfter)} tokens`;
}

function compactionLabel(item: Extract<ThreadItem, { type: "contextCompaction" }>): string {
  if (item.error) return item.error.message;
  if (item.status === "completed") return "上下文已压缩";
  if (item.status === "cancelled") return "上下文压缩已停止";
  if (item.status === "failed") return "上下文压缩失败";
  return "正在压缩上下文";
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1_000);
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

function ThinkingActivity() {
  return (
    <div className="thinking-activity" role="status">
      <ShimmerText text="思考中" />
    </div>
  );
}

function TimelineItem({ item, images, hideError = false }: { item: ThreadItem; images?: PromptImage[]; hideError?: boolean }) {
  const workspaceLinks = useContext(WorkspaceLinkContext);
  if (item.type === "reasoning") return null;
  if (item.type === "modelChange") {
    return (
      <div className="model-change-event" role="status">
        <span>已切换至 {item.name ?? item.model.id}</span>
      </div>
    );
  }
  if (item.type === "imageRead") {
    const label = item.count === 1 ? "已查看图片" : `已查看 ${item.count} images`;
    if (images?.length) {
      return (
        <LazyDetails className="image-read-details" summary={
          <summary className="timeline-event timeline-event-expandable">
            <Image size={13} aria-hidden="true" />
            <span>{label}</span>
            <ChevronRight className="tool-detail-chevron" size={12} aria-hidden="true" />
          </summary>}>
          <div className="image-read-previews">
            {images.map((image, index) => (
              <ConversationImage
                key={`${image.mediaType}:${index}`}
                image={image}
                alt={image.name ?? `Viewed image ${index + 1}`}
              />
            ))}
          </div>
        </LazyDetails>
      );
    }
    return (
      <div className="timeline-event">
        <Image size={13} aria-hidden="true" />
        <span>{label}</span>
      </div>
    );
  }
  if (item.type === "dynamicToolCall" || item.type === "mcpToolCall") return <ToolActivity item={item} />;
  if (item.type === "retry") {
    return <ConnectionActivity
      title={item.status === "failed" ? "连接错误" : `正在重连 ${item.attempt}/${item.maxAttempts}`}
      error={item.error}
      failed={item.status === "failed"}
    />;
  }
  if (item.type === "contextCompaction") {
    const label = compactionLabel(item);
    const icon = <Diskette size={13} aria-hidden="true" />;
    const shimmering = item.status === "inProgress";
    if (item.status === "completed" && item.summary) {
      return (
        <LazyDetails className="compaction-details" summary={
          <summary className="timeline-event timeline-event-expandable">
            {icon}
            <ShimmerText text={label} active={shimmering} />
            <ChevronRight className="tool-detail-chevron" size={12} aria-hidden="true" />
          </summary>}>
          <div className="compaction-content">
            {item.tokensBefore !== undefined ? <p className="compaction-stats">{compactionStats(item.tokensBefore, item.estimatedTokensAfter)}</p> : null}
            <MarkdownContent text={item.summary} {...workspaceLinks} />
          </div>
        </LazyDetails>
      );
    }
    return (
      <div className={`timeline-event${item.status === "failed" ? " timeline-event-error" : ""}`}>
        {icon}
        <ShimmerText text={label} active={shimmering} />
      </div>
    );
  }
  if (item.type === "agentMessage") {
    if (!item.text && item.status === "completed") return null;
    if (!item.text.trim() && hideError) return null;
    const message = (
      <div className={`assistant-message assistant-${item.status}`}>
        {item.text ? <MarkdownContent text={item.text} {...workspaceLinks} /> : null}
        {item.status === "cancelled" && !item.text ? <span className="muted-text">已停止</span> : null}
        {item.status === "interrupted" && !item.text ? <span className="muted-text">已中断</span> : null}
      </div>
    );
    if (!item.error || hideError) return message;
    return (
      <>
        {message}
        <ConnectionActivity title="连接错误" error={item.error} failed />
      </>
    );
  }
  return null;
}

function ConnectionActivity({ title, error, failed = false }: { title: string; error: ThreadItemError; failed?: boolean }) {
  const Icon = failed ? WifiOff : Wifi;
  const presentation = connectionErrorPresentation(title, error);
  return (
    <details className={`connection-activity-details${failed ? " connection-activity-failed" : ""}`}>
      <summary className="tool-activity tool-row tool-row-expandable timeline-activity connection-activity" role={failed ? "alert" : undefined}>
        <Icon size={13} aria-hidden="true" />
        <span className="tool-label">{presentation.title}</span>
        <ChevronRight className="tool-detail-chevron" size={12} aria-hidden="true" />
      </summary>
      <div className="connection-activity-error">{presentation.message}</div>
    </details>
  );
}

function connectionErrorPresentation(title: string, error: ThreadItemError): { title: string; message: string } {
  if (error.code === "model_not_configured") {
    return {
      title: "请先配置模型",
      message: "所选模型尚未配置。请选用可用模型，或在设置中连接其服务商后重试。",
    };
  }
  return { title, message: error.message };
}

function ToolActivity({ item, completed = false }: { item: Extract<ThreadItem, { type: "dynamicToolCall" | "mcpToolCall" }>; completed?: boolean }) {
  const presentation = completed ? completedToolPresentation(item) : toolPresentation(item);
  const Icon = presentation.icon;
  const label = item.status === "preparing" && item.type === "dynamicToolCall"
    ? preparingToolLabel(item.tool)
    : presentation.label;
  const expandable = hasToolDetails(item);
  const row = (
    <div className={`tool-activity tool-row${expandable ? " tool-row-expandable" : ""} timeline-activity tool-${item.status}`}>
      <Icon size={13} aria-hidden="true" />
      <span className="tool-label" title={label}>{label}</span>
      {expandable ? <ChevronRight className="tool-detail-chevron" size={12} aria-hidden="true" /> : null}
      <span className="tool-result" aria-label={item.status}>
        {item.status === "failed" ? <X size={12} /> : null}
      </span>
    </div>
  );
  if (!expandable) return row;
  return (
    <LazyDetails className="tool-activity-details" summary={<summary>{row}</summary>}>
      <ToolDetails item={item} />
    </LazyDetails>
  );
}

function ToolDetails({ item }: { item: ToolCallItem }) {
  const args = record(item.arguments);
  if (item.type === "dynamicToolCall" && item.tool === "web_search") return <WebSearchDetails item={item} args={args} />;
  if (item.type === "dynamicToolCall" && item.tool === "bash") return <ShellDetails item={item} command={text(args?.command)} />;
  if (item.type === "dynamicToolCall" && ["read", "grep", "find", "ls"].includes(item.tool)) return <FileOperationDetails item={item} args={args} />;
  if (item.type === "dynamicToolCall" && ["edit", "write"].includes(item.tool)) return <FileChangeDetails item={item} args={args} />;
  return <StructuredToolDetails item={item} />;
}

function WebSearchDetails({ item, args }: { item: Extract<ThreadItem, { type: "dynamicToolCall" }>; args: Record<string, unknown> | undefined }) {
  const query = text(args?.query);
  return <div className="tool-details">
    {query ? <ToolDetailBlock label="查询"><code>{query}</code></ToolDetailBlock> : null}
    {item.webSearch ? <ToolDetailBlock label="服务商"><code>{item.webSearch.providerName}</code></ToolDetailBlock> : null}
    {item.webSearch?.fallbackFrom ? <p className="tool-details-truncated">已使用备用服务，因为 {providerLabel(item.webSearch.fallbackFrom)} 暂不可用。</p> : null}
    {item.output ? <ToolDetailBlock label="结果"><pre>{item.output}</pre></ToolDetailBlock> : null}
    {item.truncated ? <p className="tool-details-truncated">结果已截断</p> : null}
    {!item.output && item.status === "failed" ? <p className="tool-details-error">网络搜索失败，未返回结果。</p> : null}
  </div>;
}

function ShellDetails({ item, command }: { item: ToolCallItem; command: string }) {
  return <div className="tool-details tool-shell-details">
    <ToolDetailBlock label="命令行"><pre className="tool-shell-command"><span className="tool-shell-prompt">$</span> {command || "command"}</pre></ToolDetailBlock>
    {item.output ? <pre className="tool-shell-output">{item.output}</pre> : null}
    {item.truncated ? <p className="tool-details-truncated">输出已截断</p> : null}
    {!item.output && item.status === "failed" ? <p className="tool-details-error">命令执行失败，未返回输出。</p> : null}
  </div>;
}

function FileOperationDetails({ item, args }: { item: ToolCallItem; args: Record<string, unknown> | undefined }) {
  return <div className="tool-details">
    {fileOperationContext(item.tool, args)}
    {item.output ? <ToolDetailBlock label="结果"><pre>{item.output}</pre></ToolDetailBlock> : null}
    {item.truncated ? <p className="tool-details-truncated">结果已截断</p> : null}
    {!item.output && item.status === "failed" ? <p className="tool-details-error">操作失败，未返回结果。</p> : null}
  </div>;
}

function FileChangeDetails({ item, args }: { item: ToolCallItem; args: Record<string, unknown> | undefined }) {
  return <div className="tool-details">
    <ToolDetailBlock label="文件"><code>{text(args?.path) || text(args?.file_path) || "未知文件"}</code></ToolDetailBlock>
    {item.output ? <ToolDetailBlock label="结果"><pre>{item.output}</pre></ToolDetailBlock> : null}
    {item.truncated ? <p className="tool-details-truncated">结果已截断</p> : null}
    {!item.output && item.status === "failed" ? <p className="tool-details-error">文件修改失败，未返回结果。</p> : null}
  </div>;
}

function StructuredToolDetails({ item }: { item: ToolCallItem }) {
  return (
    <div className="tool-details">
      {item.images?.length ? <ToolImagePreviews images={item.images} /> : null}
      {item.arguments !== undefined ? <ToolDetailBlock label="输入"><pre>{formatToolValue(item.arguments)}</pre></ToolDetailBlock> : null}
      {item.output ? <ToolDetailBlock label="输出"><pre>{item.output}</pre></ToolDetailBlock> : null}
      {item.truncated ? <p className="tool-details-truncated">输出已截断</p> : null}
      {!item.output && item.status === "failed" ? <p className="tool-details-error">工具调用失败，未返回结果。</p> : null}
    </div>
  );
}

function ToolImagePreviews({ images }: { images: PromptImage[] }) {
  return <div className="tool-result-images">
    {images.map((image, index) => (
      <ConversationImage
        key={`${image.mediaType}:${index}`}
        image={image}
        alt={image.name ?? (images.length === 1 ? "工具返回的图片" : `工具返回的图片 ${index + 1}`)}
      />
    ))}
  </div>;
}

function fileOperationContext(tool: string, args: Record<string, unknown> | undefined): ReactNode {
  const path = text(args?.path) || text(args?.file_path);
  const query = text(args?.pattern) || text(args?.query);
  if (tool === "read") return path ? <ToolDetailBlock label="文件"><code>{path}</code></ToolDetailBlock> : null;
  if (query && path) return <ToolDetailBlock label="搜索"><code>{query} in {path}</code></ToolDetailBlock>;
  if (query) return <ToolDetailBlock label="搜索"><code>{query}</code></ToolDetailBlock>;
  return path ? <ToolDetailBlock label="路径"><code>{path}</code></ToolDetailBlock> : null;
}

function ToolDetailBlock({ label, children }: { label: string; children: ReactNode }) {
  return <div className="tool-detail-block"><span className="tool-detail-label">{label}</span>{children}</div>;
}

function hasToolDetails(item: ToolCallItem): boolean {
  if (item.status === "failed" || item.truncated) return true;
  if (item.type === "mcpToolCall") return item.arguments !== undefined || Boolean(item.output) || Boolean(item.images?.length);
  if (item.tool === "bash") return Boolean(text(record(item.arguments)?.command) || item.output);
  if (["read", "grep", "find", "ls", "edit", "write"].includes(item.tool)) return Boolean(item.output);
  return item.arguments !== undefined || Boolean(item.output) || Boolean(item.images?.length);
}

function formatToolValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function ArtifactPreviews({ projectId, artifacts }: { projectId: string; artifacts: ToolArtifact[] }) {
  return <div className="tool-artifacts">{artifacts.map((artifact) => <ArtifactPreview key={artifact.path} projectId={projectId} artifact={artifact} />)}</div>;
}

function ArtifactPreview({ projectId, artifact }: { projectId: string; artifact: ToolArtifact }) {
  const [url, setUrl] = useState<string>();
  const [target, visible] = useNearViewport<HTMLDivElement>();
  useEffect(() => {
    if (!visible) return;
    let disposed = false;
    let objectUrl: string | undefined;
    setUrl(undefined);
    void getWorkspaceAsset(projectId, artifact.path).then((blob) => {
      if (disposed) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => undefined);
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [artifact.path, projectId, visible]);
  return <div ref={target} className="tool-artifact-preview">{!url ? null : artifact.type === "model"
    ? <ModelPreview source={url} label="已生成 3D 模型" minHeight={320} />
    : artifact.type === "video"
      ? <video className="tool-artifact-video" src={url} controls preload="metadata" />
    : <img className="tool-artifact-image" src={url} alt="已生成图片" />}</div>;
}

function preparingToolLabel(toolName: string): string {
  switch (toolName) {
    case "bash": return "正在准备命令";
    case "read": return "正在准备读取";
    case "write": return "正在准备文件";
    case "edit": return "正在准备编辑";
    case "web_search": return "正在准备网络搜索";
    case "mcp": return "正在准备 MCP";
    case "game_use": return "正在准备游戏操作";
    case "tool": return "正在准备";
    default: return `正在准备 ${toolName}`;
  }
}

function runningToolGroupLabel(item: ToolCallItem, label: string): string {
  if (item.type === "mcpToolCall") return label;
  switch (item.tool) {
    case "edit":
    case "write": return "编辑文件";
    case "read": return "读取文件";
    case "grep":
    case "find": return "搜索文件";
    case "ls": return "列出文件";
    case "web_search": return "搜索网络";
    default: return item.status === "preparing" ? preparingToolLabel(item.tool) : label;
  }
}

function toolPresentation(item: Extract<ThreadItem, { type: "dynamicToolCall" | "mcpToolCall" }>): { icon: ToolIcon; label: string } {
  if (item.type === "mcpToolCall") {
    return { icon: mcpToolBrand(item) === "godot" ? GodotIcon : Plug, label: mcpToolLabel(item) };
  }
  const toolName = item.tool;
  const args = item.arguments;
  const values = record(args);
  switch (toolName) {
    case "bash": return { icon: Terminal, label: `正在运行 ${text(values?.command) || "command"}` };
    case "edit": return { icon: FilePenLine, label: withTarget("正在编辑", values) };
    case "write": return { icon: FileText, label: withTarget("正在写入", values) };
    case "read": return { icon: FileText, label: withTarget("正在读取", values) };
    case "grep": return { icon: Search, label: searchLabel("正在搜索", values) };
    case "find": return { icon: Search, label: searchLabel("正在查找", values) };
    case "ls": return { icon: FileText, label: withTarget("正在列出", values) };
    case "web_search": return { icon: Search, label: searchLabel("正在搜索网络：", values) };
    case "game_use": return { icon: Gamepad2, label: playtestLabel(values, false) };
    case "generate_image": return { icon: WandSparkles, label: "正在生成图片" };
    default: return { icon: Wrench, label: toolName };
  }
}

function completedToolPresentation(item: Extract<ThreadItem, { type: "dynamicToolCall" | "mcpToolCall" }>): { icon: ToolIcon; label: string } {
  if (item.type === "mcpToolCall") {
    return { icon: mcpToolBrand(item) === "godot" ? GodotIcon : Plug, label: mcpToolLabel(item) };
  }
  const toolName = item.tool;
  const args = item.arguments;
  const values = record(args);
  switch (toolName) {
    case "bash": return { icon: Terminal, label: `已运行 ${text(values?.command) || "command"}` };
    case "edit":
    case "write": return { icon: FilePenLine, label: withTarget("已编辑", values) };
    case "read": return { icon: FileText, label: withTarget("已读取", values) };
    case "grep": return { icon: Search, label: searchLabel("已搜索", values) };
    case "find": return { icon: Search, label: searchLabel("已搜索", values) };
    case "ls": return { icon: FileText, label: withTarget("已列出", values) };
    case "web_search": return { icon: Search, label: searchLabel("已搜索网络：", values) };
    case "game_use": return { icon: Gamepad2, label: playtestLabel(values, true) };
    case "generate_image": return { icon: WandSparkles, label: "已生成图片" };
    default: return { icon: Wrench, label: `已使用 ${toolName}` };
  }
}

function playtestLabel(values: Record<string, unknown> | undefined, completed: boolean): string {
  switch (text(values?.operation)) {
    case "open": return completed ? "已打开游戏预览" : "正在打开游戏预览";
    case "inspect": return completed ? "已检查游戏状态" : "正在检查游戏状态";
    case "act": {
      const count = Array.isArray(values?.actions) ? values.actions.length : 0;
      const target = count === 1 ? "一次试玩操作" : "试玩操作";
      return completed ? `已运行 ${target}` : `正在运行 ${target}`;
    }
    case "capture": return completed ? "已截取游戏画面" : "正在截取游戏画面";
    case "close": return completed ? "已关闭游戏预览" : "正在关闭游戏预览";
    default: return completed ? "已使用游戏试玩" : "正在运行游戏试玩";
  }
}

function providerLabel(provider: "exa" | "parallel" | "custom"): string {
  return provider === "exa" ? "Exa" : provider === "parallel" ? "Parallel" : "自定义服务商";
}

function searchLabel(action: string, values: Record<string, unknown> | undefined): string {
  const query = text(values?.pattern) || text(values?.query);
  const target = text(values?.path) || text(values?.file_path);
  if (query && target) return `${action} ${query} in ${target}`;
  if (query) return `${action} ${query}`;
  return target ? `${action} files in ${target}` : `${action} files`;
}

function withTarget(action: string, values: Record<string, unknown> | undefined): string {
  const target = text(values?.path) || text(values?.file_path);
  return target ? `${action} ${target}` : `${action} file`;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
