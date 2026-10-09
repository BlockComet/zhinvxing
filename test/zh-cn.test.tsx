import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "../src/renderer/settings-page.js";
import { PublicationDetails } from "../src/renderer/publish-dialog.js";
import { DesktopWindowFrame } from "../src/renderer/desktop-window-frame.js";
import { PROJECT_TYPES } from "../src/renderer/project-types.js";
import { projectTime } from "../src/renderer/project-card.js";
import { reasoningLabel, parseReasoningLevel } from "../src/shared/reasoning.js";

vi.mock("../src/renderer/auth.js", () => ({ useAuth: () => ({ state: { status: "signed-out" }, openSignIn: vi.fn() }) }));

beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  vi.stubGlobal("window", { ohMyGameDesktop: { platform: "win32", windowMenu: { icon: async () => "", popup: vi.fn() } } });
});
afterEach(() => vi.unstubAllGlobals());

describe("Simplified Chinese desktop build", () => {
  it("renders settings and appearance in Chinese with unchanged theme values", () => {
    const html = renderToStaticMarkup(<SettingsPage section="appearance" onBack={() => {}} onSectionChange={() => {}} onPluginChange={() => {}} onAddPlugin={async () => {}} onTryPlugin={async () => {}} />);
    for (const text of ["服务商与模型", "账号", "外观", "主题", "跟随系统", "浅色", "深色", "聊天面板位置"]) expect(html).toContain(text);
    expect(html).toContain('settings-theme-option is-system is-selected');
    expect(html).not.toContain("Providers &amp; Models");
  });
  it("renders Chinese native-menu triggers without changing bridge identifiers", () => {
    const html = renderToStaticMarkup(<DesktopWindowFrame><span>Project File</span></DesktopWindowFrame>);
    for (const text of ["文件", "编辑", "视图", "窗口", "Project File"]) expect(html).toContain(text);
    expect(html).toContain('role="menuitem"');
  });
  it("preserves user titles and published URLs while translating controls", () => {
    const html = renderToStaticMarkup(<PublicationDetails publication={{ gameId: "game-1", deploymentId: "deploy-1", playUrl: "https://example.test/MyGame", title: "My English Game", description: "Keep my text", publishedAt: "2026-10-09T00:00:00Z" }} name="My English Game" justPublished onClose={() => {}} onUpdate={() => {}} />);
    expect(html).toContain("发布成功");
    expect(html).toContain("My English Game");
    expect(html).toContain("https://example.test/MyGame");
  });
  it("keeps API project and reasoning enums unchanged", () => {
    expect(PROJECT_TYPES.map(x => x.value)).toEqual(["web-game", "interactive-story", "asset-canvas", "godot-game"]);
    expect(reasoningLabel("high")).toBe("高");
    expect(parseReasoningLevel("high")).toBe("high");
    expect(parseReasoningLevel("高")).toBeUndefined();
  });
  it("formats relative dates in Chinese", () => {
    expect(projectTime("2026-10-09T00:00:00Z", new Date("2026-10-09T00:05:00Z"))).toBe("5 分钟前编辑");
  });
});
