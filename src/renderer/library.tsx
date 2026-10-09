import { useEffect, useMemo, useState } from "react";
import {
  AssetToolbar,
  fileName,
  fileStem,
  WorkspaceAssetCard,
  WorkspaceAssetDialog,
  type MediaFilter,
} from "./asset-browser.js";
import { deleteLibraryAsset, forceDeleteLibraryAsset, listLibraryAssetReferences, renameLibraryAsset, saveLibraryAsset, type LibraryAssetReference } from "./api.js";
import { Image as ImageIcon, LoaderCircle, RefreshCw, X } from "./icons.js";
import { filterLibraryAssets, loadLibraryAssets, type LibraryAsset, type LibraryAssetFilters } from "./library-assets.js";
import { LibraryCollectionFilters } from "./library-filters.js";
import type { AppNavigationTarget } from "./routes.js";
import { ProjectRenameDialog } from "./project-rename-dialog.js";
import { SidebarPageHeader, SidebarPageLayout } from "./sidebar-page.js";

interface LibraryPageProps {
  onNavigate: (page: AppNavigationTarget) => void;
}

export function LibraryPage({ onNavigate }: LibraryPageProps) {
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<LibraryAssetFilters>({});
  const [selectedAsset, setSelectedAsset] = useState<LibraryAsset>();
  const [deleteTarget, setDeleteTarget] = useState<{ asset: LibraryAsset; references: LibraryAssetReference[] }>();
  const [deleting, setDeleting] = useState(false);
  const [renameTarget, setRenameTarget] = useState<LibraryAsset>();

  async function load(): Promise<void> {
    setPhase("loading");
    setError(undefined);
    try {
      setAssets(await loadLibraryAssets());
      setPhase("ready");
    } catch (cause) {
      setError(errorMessage(cause));
      setPhase("error");
    }
  }

  useEffect(() => { void load(); }, []);

  async function runAssetAction(action: () => Promise<unknown>): Promise<boolean> {
    setActionError(undefined);
    try {
      await action();
      await load();
      return true;
    } catch (cause) {
      setActionError(errorMessage(cause));
      return false;
    }
  }

  function beginRename(asset: LibraryAsset): void {
    setActionError(undefined);
    setSelectedAsset(undefined);
    setRenameTarget(asset);
  }

  async function save(asset: LibraryAsset): Promise<void> {
    if (await runAssetAction(() => saveLibraryAsset(asset.id))) setSelectedAsset(undefined);
  }

  async function remove(asset: LibraryAsset): Promise<void> {
    setActionError(undefined);
    try {
      const references = await listLibraryAssetReferences(asset.id);
      if (references.length) {
        setSelectedAsset(undefined);
        setDeleteTarget({ asset, references });
        return;
      }
      if (!window.confirm(`删除「${fileName(asset.path)}” from Library? This cannot be undone.`)) return;
      if (await runAssetAction(() => deleteLibraryAsset(asset.id))) setSelectedAsset(undefined);
    } catch (cause) {
      setActionError(errorMessage(cause));
    }
  }

  async function confirmForceDelete(): Promise<void> {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const deleted = await runAssetAction(() => forceDeleteLibraryAsset(deleteTarget.asset.id));
    setDeleting(false);
    if (deleted) {
      setDeleteTarget(undefined);
      setSelectedAsset(undefined);
    }
  }

  const visibleAssets = useMemo(() => filterLibraryAssets(assets, mediaFilter, query, filters), [assets, mediaFilter, query, filters]);

  return (
    <SidebarPageLayout active="library" onNavigate={onNavigate}>
      <SidebarPageHeader title="素材库">
        <AssetToolbar mediaFilter={mediaFilter} query={query} onMediaFilterChange={setMediaFilter} onQueryChange={setQuery}>
          <LibraryCollectionFilters assets={assets} filters={filters} onChange={setFilters} />
        </AssetToolbar>
      </SidebarPageHeader>
      {actionError ? <p className="library-action-error" role="alert">{actionError}</p> : null}
      {phase === "loading" && assets.length === 0 ? <LibraryState><LoaderCircle className="spin" size={18} />正在加载素材</LibraryState> : null}
      {phase === "error" ? <LibraryState error><X size={18} />{error}<button type="button" onClick={() => void load()}><RefreshCw size={14} />重试</button></LibraryState> : null}
      {phase === "ready" && visibleAssets.length === 0 ? <LibraryState><ImageIcon size={18} />{assets.length ? "没有符合筛选条件的素材" : "暂无媒体素材"}</LibraryState> : null}
      {visibleAssets.length ? <div className="library-grid">{visibleAssets.map((asset) => <WorkspaceAssetCard
        asset={asset}
        key={asset.id}
        title={fileName(asset.path)}
        onOpen={() => setSelectedAsset(asset)}
        onRename={() => beginRename(asset)}
        onDelete={() => void remove(asset)}
        onSaveToLibrary={asset.saved === false || asset.referenceOnly ? () => void save(asset) : undefined}
      />)}</div> : null}
      {selectedAsset ? <WorkspaceAssetDialog
        asset={selectedAsset}
        onClose={() => setSelectedAsset(undefined)}
        onRename={() => beginRename(selectedAsset)}
        onDelete={() => void remove(selectedAsset)}
        onSaveToLibrary={selectedAsset.saved === false || selectedAsset.referenceOnly ? () => void save(selectedAsset) : undefined}
      /> : null}
      {deleteTarget ? <div className="library-delete-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteTarget(undefined); }}>
        <section className="library-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="library-delete-title" onKeyDown={(event) => { if (event.key === "Escape" && !deleting) setDeleteTarget(undefined); }}>
          <h2 id="library-delete-title">从所有位置删除素材？</h2>
          <p><strong>{fileName(deleteTarget.asset.path)}</strong> 正在被以下项目使用： {deleteTarget.references.length === 1 ? "此项目" : `${deleteTarget.references.length} projects`}.</p>
          <p className="library-delete-warning">删除后，该素材也会从这些项目中移除。仍引用它的代码需要更换素材。此操作无法撤销。</p>
          <ul>{deleteTarget.references.map((reference) => <li key={reference.id}>{reference.name}</li>)}</ul>
          {actionError ? <p className="library-delete-error" role="alert">{actionError}</p> : null}
          <footer><button type="button" autoFocus disabled={deleting} onClick={() => setDeleteTarget(undefined)}>取消</button><button className="library-action-delete" type="button" disabled={deleting} onClick={() => void confirmForceDelete()}>{deleting ? "正在删除…" : "从所有位置删除"}</button></footer>
        </section>
      </div> : null}
      {renameTarget ? <ProjectRenameDialog title="重命名素材" name={fileStem(renameTarget.path)} returnFocus={null} onClose={() => setRenameTarget(undefined)} onConfirm={(input) => {
        const asset = renameTarget;
        setRenameTarget(undefined);
        const name = input.trim();
        if (name && name !== fileStem(asset.path)) void runAssetAction(() => renameLibraryAsset(asset.id, name));
      }} /> : null}
    </SidebarPageLayout>
  );
}

export { filterLibraryAssets } from "./library-assets.js";

function LibraryState({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <div className={`library-state${error ? " library-state-error" : ""}`} role={error ? "alert" : undefined}>{children}</div>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
