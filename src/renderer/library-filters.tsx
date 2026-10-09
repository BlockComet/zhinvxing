import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal, X } from "./icons.js";
import { libraryAssetProjects, type LibraryAsset, type LibraryAssetFilters } from "./library-assets.js";
import { menuPlacement } from "./popover-placement.js";
import type { ProjectAssetFilters, BrowsableAsset } from "./asset-browser.js";

export function LibraryCollectionFilters({ assets, filters, onChange, defaultIncludeReferences = false }: {
  assets: readonly LibraryAsset[];
  filters: LibraryAssetFilters;
  onChange: (filters: LibraryAssetFilters) => void;
  defaultIncludeReferences?: boolean;
}) {
  const projects = libraryAssetProjects(assets);
  const active = (filters.origin ?? "saved") !== "saved" || Boolean(filters.projectId) || (filters.includeReferences ?? false) !== defaultIncludeReferences;
  return <AssetFilterPopover active={active} onReset={() => onChange({ includeReferences: defaultIncludeReferences })}>
    <label>来源<select value={filters.origin ?? "saved"} onChange={(event) => onChange({ ...filters, origin: event.target.value as LibraryAssetFilters["origin"] })}>
      <option value="saved">素材库</option>
      <option value="generated">已生成</option>
      <option value="uploaded">已上传</option>
      <option value="workspace">来自项目</option>
      <option value="all">全部来源</option>
    </select></label>
    <label>项目<select value={filters.projectId ?? ""} onChange={(event) => onChange({ ...filters, projectId: event.target.value })}>
      <option value="">全部项目</option>
      <option value="unassigned">无所属项目</option>
      {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
    </select></label>
    <label className="library-reference-toggle"><input type="checkbox" checked={filters.includeReferences ?? false} onChange={(event) => onChange({ ...filters, includeReferences: event.target.checked })} /><span>包含参考素材</span></label>
  </AssetFilterPopover>;
}

export function ProjectAssetCollectionFilters({ assets, filters, onChange }: {
  assets: readonly BrowsableAsset[];
  filters: ProjectAssetFilters;
  onChange: (filters: ProjectAssetFilters) => void;
}) {
  const active = (filters.origin ?? "all") !== "all" || (filters.purpose ?? "all") !== "all";
  return <AssetFilterPopover active={active} onReset={() => onChange({})}>
    <label>来源<select value={filters.origin ?? "all"} onChange={(event) => onChange({ ...filters, origin: event.target.value as ProjectAssetFilters["origin"] })}>
      <option value="all">全部来源</option>
      <option value="generated">已生成</option>
      <option value="uploaded">已上传</option>
      <option value="workspace">项目文件</option>
      {assets.some((asset) => asset.origin === "builtin") ? <option value="builtin">内置</option> : null}
    </select></label>
    <label>用途<select value={filters.purpose ?? "all"} onChange={(event) => onChange({ ...filters, purpose: event.target.value as ProjectAssetFilters["purpose"] })}>
      <option value="all">全部用途</option>
      <option value="asset">素材</option>
      <option value="reference">引用</option>
    </select></label>
  </AssetFilterPopover>;
}

function AssetFilterPopover({ active, onReset, children }: { active: boolean; onReset: () => void; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number }>();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const titleId = `library-filters-${useId()}`;

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  useLayoutEffect(() => {
    if (!open) { setPosition(undefined); return; }
    const anchor = trigger.current?.getBoundingClientRect();
    const bounds = popup.current?.getBoundingClientRect();
    if (anchor && bounds) setPosition(menuPlacement(anchor, bounds, { width: window.innerWidth, height: window.innerHeight }, "end"));
  }, [open, active]);

  useLayoutEffect(() => {
    if (open && position && document.activeElement === trigger.current) popup.current?.querySelector("select")?.focus();
  }, [open, position]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!popup.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    };
    const resize = () => setOpen(false);
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", escape, true);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", resize);
    };
  }, [open]);

  return <>
    <button ref={trigger} className={`library-filter-trigger${active ? " is-active" : ""}`} type="button" title="筛选素材" aria-label="筛选素材" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}>
      <SlidersHorizontal size={16} />{active ? <span className="library-filter-dot" /> : null}
    </button>
    {open ? createPortal(<div ref={popup} className="library-filter-popover" role="dialog" aria-labelledby={titleId} style={position ?? { top: 0, left: 0, visibility: "hidden" }}>
      <header><strong id={titleId}>筛选</strong><button type="button" title="关闭筛选" aria-label="关闭筛选" onClick={close}><X size={14} /></button></header>
      {children}
      {active ? <button className="library-filter-reset" type="button" onClick={onReset}>重置筛选</button> : null}
    </div>, document.body) : null}
  </>;
}
