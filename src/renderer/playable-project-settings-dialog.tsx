import { useState, type FormEvent } from "react";
import type { ProjectState } from "../shared/contracts.js";
import type { NodeGraph } from "../shared/playable-nodes.js";
import {
  canvasFormatForViewport,
  canvasFormatPreset,
  canvasFormatSummary,
  type CanvasFormatPresetId,
  type Viewport,
} from "../shared/canvas-formats.js";
import { formatStateValue } from "../shared/playable-debug.js";
import { describePlayableValue } from "../shared/playable-editor.js";
import { CanvasFormatOptions } from "./canvas-format-options.js";
import { CircleHelp, Download, LoaderCircle } from "./icons.js";
import { ProjectSettingsDialogFrame } from "./project-settings-dialog.js";

const variablesHelp =
  "游戏在场景之间保留的数据。可请 AI 添加或修改这些值。";

export function PlayableProjectSettingsDialog({
  project,
  graph,
  exporting,
  canExport,
  onSave,
  onExport,
  onClose,
}: {
  project: ProjectState;
  graph: NodeGraph;
  exporting: boolean;
  canExport: boolean;
  onSave: (viewport: Viewport) => Promise<void>;
  onExport: () => Promise<void>;
  onClose: () => void;
}) {
  const [selection, setSelection] = useState<CanvasFormatPresetId | undefined>(
    () => canvasFormatForViewport(graph.viewport)?.id,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const viewport = selection
    ? canvasFormatPreset(selection).viewport
    : graph.viewport;
  const changed =
    viewport.width !== graph.viewport.width ||
    viewport.height !== graph.viewport.height;
  const names = Object.keys(graph.initialState);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (saving || exporting) return;
    setSaving(true);
    setError(undefined);
    try {
      if (changed) await onSave(viewport);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSaving(false);
    }
  }

  async function exportProject(): Promise<void> {
    setError(undefined);
    try {
      await onExport();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <ProjectSettingsDialogFrame busy={saving || exporting} onClose={onClose}>
      <form onSubmit={(event) => void submit(event)}>
        <section className="project-settings-project" aria-label="项目">
          <span>项目</span>
          <strong title={project.name}>{project.name}</strong>
        </section>
        <fieldset
          className="project-settings-section"
          disabled={saving || exporting}
        >
          <legend>画面尺寸</legend>
          <p className="project-settings-hint">
            {canvasFormatSummary(viewport)}
          </p>
          <CanvasFormatOptions
            value={selection}
            disabled={saving || exporting}
            onChange={setSelection}
          />
          {changed && graph.nodes.length > 0 ? (
            <p className="project-settings-hint">
              修改画面尺寸后，请逐一检查场景。
            </p>
          ) : null}
        </fieldset>
        <fieldset className="project-settings-section" aria-label="变量">
          <legend className="project-settings-section-heading">
            变量
            <button
              className="icon-button project-settings-help"
              type="button"
              aria-label="关于变量"
              aria-description={variablesHelp}
              data-tooltip={variablesHelp}
              disabled={saving || exporting}
            >
              <CircleHelp size={14} aria-hidden="true" />
            </button>
          </legend>
          {names.length ? (
            <ul className="playable-variables" aria-label="变量">
              {names.map((name) => (
                <li key={name}>
                  <div className="playable-variables-head">
                    <strong>{name}</strong>
                    <span title={formatStateValue(graph.initialState[name])}>
                      初始值 {describePlayableValue(graph.initialState[name]!)}
                    </span>
                  </div>
                  {graph.variables?.[name] ? (
                    <p>{graph.variables[name]}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="playable-variables-empty">
              暂无变量。游戏不会在场景之间保留数据。
            </p>
          )}
        </fieldset>
        <fieldset className="project-settings-section">
          <legend>导出</legend>
          {changed ? (
            <p className="project-settings-hint">
              导出前请先保存画面尺寸更改。
            </p>
          ) : null}
          <button
            className="project-settings-browser"
            type="button"
            disabled={!canExport || saving || exporting || changed}
            onClick={() => void exportProject()}
          >
            {exporting ? (
              <LoaderCircle className="spin" size={14} />
            ) : (
              <Download size={14} />
            )}
            {exporting ? "正在导出…" : "导出游戏"}
          </button>
        </fieldset>
        {error ? (
          <p className="project-settings-error" role="alert">
            {error}
          </p>
        ) : null}
        <footer>
          <button
            type="button"
            disabled={saving || exporting}
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="project-settings-submit"
            type="submit"
            disabled={saving || exporting}
          >
            {saving ? <LoaderCircle className="spin" size={14} /> : null}
            保存
          </button>
        </footer>
      </form>
    </ProjectSettingsDialogFrame>
  );
}
