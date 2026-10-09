import { Check, FilePenLine, FileText, History, LoaderCircle, Search, X } from "./icons.js";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ConversationSummary } from "../shared/contracts.js";

interface ConversationMenuProps {
  conversations: ConversationSummary[];
  currentConversationId?: string;
  activeConversationId?: string;
  disabled: boolean;
  onRename: (conversationId: string, title: string) => Promise<void>;
  onSelect: (conversationId: string) => void;
}

export function ConversationMenu({
  conversations,
  currentConversationId,
  activeConversationId,
  disabled,
  onRename,
  onSelect,
}: ConversationMenuProps) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const editInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => searchInput.current?.focus());
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (editingId) editInput.current?.select();
  }, [editingId]);

  function close(): void {
    setOpen(false);
    setEditingId(undefined);
    setError(undefined);
  }

  function startRename(conversation: ConversationSummary): void {
    setEditingId(conversation.id);
    setTitle(conversation.title);
    setError(undefined);
  }

  async function submitRename(event: FormEvent): Promise<void> {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!editingId || !nextTitle || saving) return;
    setSaving(true);
    setError(undefined);
    try {
      await onRename(editingId, nextTitle);
      setEditingId(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  const normalizedQuery = query.trim().toLowerCase();
  const visibleConversations = conversations.filter((conversation) => !normalizedQuery || conversation.title.toLowerCase().includes(normalizedQuery));

  return (
    <div className="conversation-menu" ref={root}>
      <button
        ref={trigger}
        className="icon-button pane-header-action conversation-trigger"
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-controls="conversation-menu-popover"
        aria-haspopup="dialog"
        title="对话历史"
        aria-label="对话历史"
        onClick={() => setOpen((value) => !value)}
      >
        <History size={14} />
      </button>

      {open ? (
        <div id="conversation-menu-popover" className="conversation-popover" role="dialog" aria-label="对话">
          <label className="project-switcher-search">
            <Search size={13} />
            <input ref={searchInput} aria-label="搜索对话" value={query} placeholder="搜索对话" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="conversation-list">
            {visibleConversations.map((conversation) => editingId === conversation.id ? (
              <form className="conversation-rename" key={conversation.id} onSubmit={submitRename}>
                <input
                  ref={editInput}
                  aria-label="对话标题"
                  disabled={saving}
                  maxLength={80}
                  onChange={(event) => setTitle(event.target.value)}
                  value={title}
                />
                <button type="submit" disabled={!title.trim() || saving} title="保存标题" aria-label="保存标题">
                  {saving ? <LoaderCircle className="spin" size={13} /> : <Check size={13} />}
                </button>
                <button type="button" disabled={saving} onClick={() => setEditingId(undefined)} title="取消重命名" aria-label="取消重命名">
                  <X size={13} />
                </button>
              </form>
            ) : (
              <div className="conversation-row" key={conversation.id}>
                <button
                  className="conversation-option"
                  type="button"
                  aria-current={conversation.id === currentConversationId ? "true" : undefined}
                  onClick={() => {
                    close();
                    if (conversation.id !== currentConversationId) onSelect(conversation.id);
                  }}
                >
                  <FileText className="conversation-option-icon" size={16} aria-hidden="true" />
                  <span className="conversation-option-copy">
                    <span className="conversation-option-title">{conversation.title}</span>
                    <span className="conversation-option-meta">
                      {conversation.id === activeConversationId
                        ? "正在运行"
                        : conversation.messageCount === 0
                          ? "空白"
                          : `${conversation.messageCount} ${conversation.messageCount === 1 ? "message" : "messages"}`}
                    </span>
                  </span>
                  <span className="conversation-option-mark" aria-hidden="true">
                    {conversation.id === currentConversationId ? <Check size={14} /> : null}
                  </span>
                </button>
                <button
                  className="conversation-rename-button"
                  type="button"
                  onClick={() => startRename(conversation)}
                  title="重命名对话"
                  aria-label={`重命名 ${conversation.title}`}
                >
                  <FilePenLine size={13} />
                </button>
              </div>
            ))}
            {!visibleConversations.length ? <div className="conversation-menu-empty">没有匹配的对话</div> : null}
          </div>
          {error ? <p className="conversation-menu-error" role="alert">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
