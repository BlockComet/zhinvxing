import { useEffect, useId, useRef, useState } from "react";
import type { ProjectCoverMode, ProjectState, PublicationState } from "../shared/contracts.js";
import { getExploreGameCover, getProjectCover, getProjectCoverState, restoreAutomaticProjectCover, setProjectCover } from "./api.js";
import { imageToWebP } from "./image.js";
import { Check, Copy, ExternalLink, Image, InfoCircle, LoaderCircle, RefreshCw, Upload, X } from "./icons.js";
import { localDebug } from "./auth.js";
import { gameHash } from "./routes.js";

export interface PublishDetails {
  title: string;
  description: string;
}

export function PublishDialog({ project, publishing, justPublished = false, onClose, onPublish }: {
  project: ProjectState;
  publishing: boolean;
  onClose: () => void;
  justPublished?: boolean;
  onPublish: (details: PublishDetails) => Promise<boolean>;
}) {
  const titleId = useId();
  const coverInputId = useId();
  const dialog = useRef<HTMLElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const coverSelection = useRef(0);
  const [title, setTitle] = useState(project.publication?.title ?? project.name);
  const [description, setDescription] = useState(project.publication?.description ?? "");
  const [savedCover, setSavedCover] = useState<Blob>();
  const [pendingCover, setPendingCover] = useState<Blob>();
  const [coverMode, setCoverMode] = useState<ProjectCoverMode>();
  const coverUrl = useCoverUrl(pendingCover ?? savedCover);
  const [coverLoading, setCoverLoading] = useState(true);
  const [coverOperation, setCoverOperation] = useState<"process" | "apply" | "restore">();
  const [coverNotice, setCoverNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(!project.publication);
  const publication = editing ? undefined : project.publication;
  const busy = publishing || submitting || Boolean(coverOperation);
  const submitLabel = coverOperation === "process" ? "正在处理封面…" : coverOperation ? "正在保存封面…" : busy ? "正在发布…" : project.publication ? "发布更新" : "发布";

  useEffect(() => {
    if (!editing) return;
    let active = true;
    setCoverLoading(true);
    void Promise.all([getProjectCover(project.id), getProjectCoverState(project.id)]).then(([value, state]) => {
      if (!active) return;
      setSavedCover(value);
      setCoverMode(state.mode);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => { if (active) setCoverLoading(false); });
    return () => {
      active = false;
      coverSelection.current += 1;
    };
  }, [project.id, editing]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    return () => previousFocus?.focus();
  }, []);

  useEffect(() => {
    if (editing) titleInput.current?.focus();
    else dialog.current?.focus();
  }, [editing]);

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      // Auth can open above this dialog while publishing waits for a token.
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== dialog.current) return;
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onClose();
      }
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])")];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        event.preventDefault();
        dialog.current.focus();
        return;
      }
      if (document.activeElement === dialog.current || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    };
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [busy, onClose]);

  async function selectCover(file: File | undefined): Promise<void> {
    if (!file) return;
    const selection = ++coverSelection.current;
    setError(undefined);
    setCoverNotice(undefined);
    setCoverOperation("process");
    try {
      const nextCover = await imageToWebP(file);
      if (selection !== coverSelection.current) return;
      setPendingCover(nextCover);
    } catch (cause) {
      if (selection === coverSelection.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (selection === coverSelection.current) setCoverOperation(undefined);
    }
  }

  async function applyCover(): Promise<void> {
    if (!pendingCover || busy) return;
    const nextCover = pendingCover;
    setCoverOperation("apply");
    setError(undefined);
    try {
      await setProjectCover(project.id, nextCover);
      setSavedCover(nextCover);
      setPendingCover(undefined);
      setCoverMode("custom");
      setCoverNotice("封面已应用，自动替换已关闭。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCoverOperation(undefined);
    }
  }

  async function restoreCover(): Promise<void> {
    if (busy) return;
    setCoverOperation("restore");
    setError(undefined);
    setCoverNotice(undefined);
    try {
      await restoreAutomaticProjectCover(project.id);
      setCoverMode("auto");
      setSavedCover(undefined);
      setSavedCover(await getProjectCover(project.id));
      setCoverNotice("已恢复自动封面。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCoverOperation(undefined);
    }
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const normalizedTitle = title.trim();
    if (!normalizedTitle || busy || coverLoading) return;
    if (pendingCover) {
      setError("发布前请先应用或取消所选封面。");
      return;
    }
    setError(undefined);
    setSubmitting(true);
    try {
      if (await onPublish({ title: normalizedTitle, description: description.trim() })) {
        setEditing(false);
      } else setError("发布未完成，请重试。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="project-create-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section ref={dialog} className="publish-dialog" role="dialog" aria-modal="true" aria-busy={busy} aria-labelledby={titleId} tabIndex={-1}>
      <header><h2 id={titleId}>{publication ? justPublished ? "游戏已发布" : "已发布的游戏" : project.publication ? "发布更新" : "发布游戏"}</h2><button type="button" disabled={busy} onClick={onClose} aria-label="关闭"><X size={16} /></button></header>
      {publication ? <PublicationDetails
        publication={publication}
        name={project.name}
        justPublished={justPublished}
        onClose={onClose}
        onUpdate={() => {
          setEditing(true);
          setError(undefined);
        }}
      /> : <form onSubmit={(event) => void submit(event)}>
        <div className="publish-cover-field">
          <label htmlFor={coverInputId}>
            <span className="publish-cover-heading">封面{pendingCover ? <span>尚未应用</span> : coverMode ? <span>{coverMode === "custom" ? "自定义" : "自动"}</span> : null}</span>
            <span className="publish-cover-preview">
              {coverUrl ? <img src={coverUrl} alt="游戏封面预览" /> : <span>{coverLoading ? <LoaderCircle className="spin" size={22} /> : <Image size={22} />}{coverLoading ? "正在加载封面…" : "将自动截取预览画面"}</span>}
              <span className="publish-cover-action"><Upload size={14} />更换封面</span>
            </span>
          </label>
          <input id={coverInputId} hidden type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || coverLoading} onChange={(event) => {
            void selectCover(event.target.files?.[0]);
            event.target.value = "";
          }} />
          {pendingCover ? <div className="publish-cover-controls">
            <button type="button" disabled={busy} onClick={() => { setPendingCover(undefined); setError(undefined); setCoverNotice(undefined); }}>取消选择</button>
            <button className="project-create-submit" type="button" disabled={busy} onClick={() => void applyCover()}>{coverOperation === "apply" ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}应用封面</button>
          </div> : coverMode === "custom" ? <div className="publish-cover-controls">
            <button type="button" disabled={busy || coverLoading} onClick={() => void restoreCover()}><RefreshCw className={coverOperation === "restore" ? "spin" : undefined} size={14} />恢复自动封面</button>
          </div> : null}
          <p className="publish-cover-status" role="status">{pendingCover ? "发布前请先应用或取消所选封面。" : coverNotice ?? (coverMode === "custom" ? "自动替换已关闭。" : "封面会随项目预览自动更新。")}</p>
          {project.publication ? <p className="publish-cover-status">这是本地项目封面。发布更新后才会更改社区中的封面。</p> : null}
        </div>
        <label><span>名称</span><input ref={titleInput} value={title} maxLength={200} disabled={busy} required onChange={(event) => setTitle(event.target.value)} /></label>
        <label><span>描述</span><textarea value={description} maxLength={2000} disabled={busy} rows={4} placeholder="描述这款游戏的独特乐趣" onChange={(event) => setDescription(event.target.value)} /></label>
        {localDebug ? <LocalPublishNotice /> : null}
        {error ? <p className="project-create-error" role="alert">{error}</p> : null}
        <footer><button type="button" disabled={busy} onClick={onClose}>关闭</button><button className="project-create-submit" type="submit" aria-label={submitLabel} disabled={busy || coverLoading || Boolean(pendingCover) || !title.trim()}>{busy ? <LoaderCircle className="spin" size={14} /> : <Upload size={14} />}<span role={busy ? "status" : undefined}>{submitLabel}</span></button></footer>
      </form>}
    </section>
  </div>;
}

function useCoverUrl(cover: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!cover) {
      setUrl(undefined);
      return;
    }
    const nextUrl = URL.createObjectURL(cover);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [cover]);
  return url;
}

export function PublicationDetails({ publication, name, justPublished = false, onClose, onUpdate }: {
  publication: PublicationState;
  name: string;
  justPublished?: boolean;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const linkId = useId();
  const [cover, setCover] = useState<Blob>();
  const coverUrl = useCoverUrl(cover);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  useEffect(() => { setCopied(false); setCopyError(false); }, [publication.playUrl]);

  useEffect(() => {
    let active = true;
    setCover(undefined);
    void getExploreGameCover(publication.gameId, publication.deploymentId)
      .then((value) => { if (active) setCover(value); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [publication.gameId, publication.deploymentId]);

  async function copyLink(): Promise<void> {
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(publication.playUrl);
      setCopied(true);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
  }

  return <div className="publication-details">
    <div className="publication-summary">
      {coverUrl ? <img src={coverUrl} alt="游戏封面" /> : <Check className="publication-check" size={22} />}
      <div>
        <h3>{publication.title ?? name}</h3>
        {justPublished ? <p role="status">发布成功</p> : null}
        <time dateTime={publication.publishedAt} title="上次发布"><RefreshCw size={12} aria-hidden="true" />{publicationTime(publication.publishedAt)}</time>
      </div>
    </div>
    {publication.gameId.startsWith("local-") ? <LocalPublishNotice /> : null}
    <div className="publication-link-field">
      <label htmlFor={linkId}>游戏链接</label>
      <div>
        <input id={linkId} readOnly value={publication.playUrl} onFocus={(event) => event.currentTarget.select()} />
        <button type="button" className="icon-button" onClick={() => void copyLink()} title={copied ? "链接已复制" : "复制游戏链接"} aria-label="复制游戏链接">
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
        <a className="icon-button" href={publication.playUrl} target="_blank" rel="noopener noreferrer" title="打开游戏" aria-label="打开游戏"><ExternalLink size={16} /></a>
      </div>
      <p className={`publication-copy-status${copyError ? " is-error" : ""}`} role={copyError ? "alert" : "status"}>{copyError ? "无法复制链接。" : copied ? "链接已复制" : ""}</p>
    </div>
    <div className="publication-secondary-actions">
      <a href={gameHash(publication.gameId)} onClick={onClose}>在社区中查看</a>
      <button type="button" onClick={onUpdate}><Upload size={13} />发布更新</button>
    </div>
  </div>;
}

function LocalPublishNotice() {
  return <p className="publish-local-notice"><InfoCircle size={15} /><span>本地调试发布。此链接仅在本机有效，本地服务停止或重启后失效。</span></p>;
}

function publicationTime(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date) : "发布时间未知";
}
