import { LoaderCircle, MoreHorizontal } from "./icons.js";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { menuPlacement } from "./popover-placement.js";
import type { ProjectAgentActivity, ProjectState } from "../shared/contracts.js";
import { getProjectCover, setProjectCover, restoreAutomaticProjectCover } from "./api.js";
import { imageToWebP } from "./image.js";
import { ProjectTypeIcon, projectTypeLabel } from "./project-types.js";

export interface ProjectCardActions {
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDesign?: () => void;
}

interface ProjectCardProps {
  project: ProjectState;
  fallback: number;
  onOpen: () => void;
  actions?: ProjectCardActions;
  agentStatus?: ProjectAgentActivity["status"];
}

export function ProjectCard({ project, fallback, onOpen, actions, agentStatus }: ProjectCardProps) {
  const coverInput = useRef<HTMLInputElement>(null);
  const [coverRevision, setCoverRevision] = useState(0);
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverError, setCoverError] = useState("");
  async function changeCover(file?: File, automatic = false) {
    if (coverBusy || (!file && !automatic)) return;
    setCoverBusy(true); setCoverError(""); setMenuOpen(false);
    try {
      if (automatic) await restoreAutomaticProjectCover(project.id);
      else {
        if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 20 * 1024 * 1024) throw new Error("请选择 20 MB 以内的 PNG、JPG 或 WebP 图片。");
        await setProjectCover(project.id, await imageToWebP(file));
      }
      setCoverRevision(value => value + 1);
    } catch (cause) { setCoverError(cause instanceof Error ? cause.message : "封面保存失败，请重试。"); }
    finally { setCoverBusy(false); }
  }
  const activityLabel = agentStatus === "cancelling" ? "正在停止" : "正在工作";
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number }>();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    const closeOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) close();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", closeOutside);
    window.addEventListener("keydown", closeOnEscape);
    // The menu is fixed to the viewport, so it would drift away from its card on scroll.
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menuOpen]);

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuPosition(undefined);
      return;
    }
    const anchor = trigger.current?.getBoundingClientRect();
    const popup = menu.current?.getBoundingClientRect();
    if (!anchor || !popup) return;
    setMenuPosition(menuPlacement(anchor, popup, { width: window.innerWidth, height: window.innerHeight }));
  }, [menuOpen]);

  return (
    <article className="project-card">
      <button className="project-card-open" type="button" onClick={onOpen} aria-label={`打开 ${project.name}`}>
        <ProjectCover projectId={project.id} fallback={fallback} name={project.name} type={project.type} revision={coverRevision} />
        <span className="project-card-meta">
          <span className="project-card-copy">
            <span className="project-card-name" title={project.name}>{project.name}</span>
            <span className="project-card-details" title={`${projectTypeLabel(project.type)} · ${agentStatus ? `AI 助手 ${activityLabel}` : projectTimestamp(project.updatedAt) ?? projectTime(project.updatedAt)}`}>
              <ProjectTypeIcon type={project.type} size={12} />
              <span>{projectTypeLabel(project.type)}</span>
              <i aria-hidden="true">·</i>
              {agentStatus ? <span className="project-card-activity" role="status">
                <LoaderCircle className="spin" size={11} aria-hidden="true" />
                {activityLabel}
              </span> : <span className="project-card-time">{projectTime(project.updatedAt)}</span>}
            </span>
          </span>
        </span>
      </button>
      <input ref={coverInput} type="file" hidden accept="image/png,image/jpeg,image/webp" aria-label={`为 ${project.name} 选择封面`} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void changeCover(file); }} />
      {coverBusy ? <span className="project-cover-notice" role="status">正在保存封面…</span> : null}
      {coverError ? <p className="project-cover-error" role="alert">{coverError}</p> : null}
      {actions ? (
        <div className="project-card-actions">
          <button
            disabled={coverBusy}
            ref={trigger}
            className="project-card-menu"
            type="button"
            aria-label={`项目操作：${project.name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((current) => !current)}
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen ? createPortal(
            // Rendered in body so scroll containers such as .home-content cannot clip it.
            <div
              ref={menu}
              className="project-card-actions-menu"
              role="menu"
              style={menuPosition ?? { top: 0, left: 0, visibility: "hidden" }}
            >
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); actions.onRename(); }}>重命名</button>
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); coverInput.current?.click(); }}>更换封面…</button>
              <button type="button" role="menuitem" onClick={() => void changeCover(undefined, true)}>使用自动封面</button>
              {actions.onDesign ? <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); actions.onDesign?.(); }}>游戏设计</button> : null}
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); actions.onDuplicate(); }}>创建副本</button>
              <button className="project-card-actions-delete" type="button" role="menuitem" onClick={() => { setMenuOpen(false); actions.onDelete(); }}>
                {project.workspaceLocation === "external" ? "从织女星中移除" : "删除"}
              </button>
            </div>,
            document.body,
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function ProjectCover({ projectId, fallback, name, type, revision = 0 }: { projectId: string; fallback: number; name: string; type: ProjectState["type"]; revision?: number }) {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    setUrl(undefined);
    let objectUrl: string | undefined;
    let disposed = false;
    void getProjectCover(projectId).then((cover) => {
      if (!cover || disposed) return;
      objectUrl = URL.createObjectURL(cover);
      setUrl(objectUrl);
    }).catch(() => {});
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [projectId, revision]);

  const palette = projectId ? Array.from(projectId).reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 0) % 4 : fallback;
  return (
    <span className={`project-card-preview project-card-preview-${palette}${url ? "" : " is-placeholder"}`} aria-hidden="true">
      {url ? <img src={url} alt="" onError={() => setUrl(undefined)} /> : <span className="project-cover-identity">
        <span className="project-cover-symbol"><ProjectTypeIcon type={type} size={22} /></span>
        <strong>{name}</strong>
        <span className="project-cover-caption">尚无游戏截图</span>
      </span>}
    </span>
  );
}

export function projectTime(value: string, now = new Date()): string {
  const updatedAt = new Date(value);
  const elapsed = now.getTime() - updatedAt.getTime();
  if (!Number.isFinite(elapsed) || elapsed < 60_000) return "刚刚编辑";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes} 分钟前编辑`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前编辑`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前编辑`;
  const includeYear = updatedAt.getFullYear() !== now.getFullYear();
  return `编辑于 ${updatedAt.toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" } : {}),
  })}`;
}

function projectTimestamp(value: string): string | undefined {
  const updatedAt = new Date(value);
  if (!Number.isFinite(updatedAt.getTime())) return undefined;
  return updatedAt.toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
