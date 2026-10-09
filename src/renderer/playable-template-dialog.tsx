import { useEffect, useId, useRef } from "react";
import { X } from "./icons.js";
import type { PlayablePresetSummary } from "../shared/playable-editor.js";
import blank from "./assets/templates/blank.webp";
import choice from "./assets/templates/choice.webp";
import ending from "./assets/templates/ending.webp";
import hotspot from "./assets/templates/hotspot.webp";
import mainMenu from "./assets/templates/main-menu.webp";
import qte from "./assets/templates/qte.webp";
import storyMap from "./assets/templates/story-map.webp";

/**
 * Pictures of each Template as a new Scene looks: its starter source with the
 * default Project Style and no background, titled with the Template's name.
 * Recapture them from the canvas thumbnails when a Template's source changes.
 * The Story map's shows a sample story partly played instead, since a new
 * one has nothing seen to show.
 */
const TEMPLATE_PICTURES: Record<string, string> = {
  blank,
  choice,
  ending,
  hotspot,
  "main-menu": mainMenu,
  qte,
  "story-map": storyMap,
};
const TEMPLATE_ZH: Record<string, { label: string; summary: string }> = {
  blank: { label: "空白场景", summary: "播放视频或展示图片，然后继续" },
  "main-menu": { label: "主菜单", summary: "标题与可选入口列表" },
  choice: { label: "分支选择", summary: "让玩家作出选择，进入不同剧情" },
  qte: { label: "限时操作", summary: "在限定时间内完成操作" },
  hotspot: { label: "热点探索", summary: "点击画面中的热点探索线索" },
  ending: { label: "结局", summary: "展示故事的结局" },
  "story-map": { label: "故事地图", summary: "查看剧情分支与已访问的场景" },
};

/** Add a Scene: a grid of Templates, each with a picture and one line. */
export function PlayableTemplateDialog({ presets, busy, onChoose, onClose }: {
  presets: readonly PlayablePresetSummary[];
  busy: boolean;
  onChoose: (presetId: string) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    dialog.current?.querySelector<HTMLElement>("button.playable-template")?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>("button:not(:disabled)")];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  return <div className="project-create-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} className="project-create-dialog playable-template-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header>
        <div>
          <h2 id={titleId}>添加场景</h2>
          <p>选择起点，然后在聊天中描述场景。</p>
        </div>
        <button type="button" aria-label="关闭" onClick={onClose}><X size={16} /></button>
      </header>
      <div className="playable-template-grid">
        {presets.map((preset) => <button
          type="button"
          className="playable-template"
          key={preset.id}
          disabled={busy}
          onClick={() => onChoose(preset.id)}
        >
          <span className="playable-template-picture">
            {TEMPLATE_PICTURES[preset.id] ? <img src={TEMPLATE_PICTURES[preset.id]} alt="" /> : null}
          </span>
          <strong>{TEMPLATE_ZH[preset.id]?.label ?? preset.label}</strong>
          <small>{TEMPLATE_ZH[preset.id]?.summary ?? preset.summary}</small>
        </button>)}
      </div>
    </section>
  </div>;
}
