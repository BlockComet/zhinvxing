import { LoaderCircle, MoreHorizontal } from "./icons.js";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { menuPlacement } from "./popover-placement.js";
import type { ProjectAgentActivity, ProjectState } from "../shared/contracts.js";
import { getProjectCover } from "./api.js";
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
        <ProjectCover projectId={project.id} fallback={fallback} />
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
      {actions ? (
        <div className="project-card-actions">
          <button
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
              {actions.onDesign ? <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); actions.onDesign?.(); }}>游戏设计</button> : null}
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); actions.onDuplicate(); }}>创建副本</button>
              <button className="project-card-actions-delete" type="button" role="menuitem" onClick={() => { setMenuOpen(false); actions.onDelete(); }}>
                {project.workspaceLocation === "external" ? "从 OhMyGame 中移除" : "删除"}
              </button>
            </div>,
            document.body,
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function ProjectCover({ projectId, fallback }: { projectId: string; fallback: number }) {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
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
  }, [projectId]);

  return (
    <span className={`project-card-preview project-card-preview-${fallback}`} aria-hidden="true">
      {url ? <img src={url} alt="" /> : null}
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
