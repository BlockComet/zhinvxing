import { describe, expect, it } from "vitest";
import { defaultProjectName, GAME_PROJECT_TYPES, PROJECT_TYPES, projectTypeLabel } from "../src/renderer/project-types.js";

describe("project types", () => {
  it("keeps the shared labels and display order", () => {
    expect(PROJECT_TYPES).toEqual([
      { label: "网页游戏", value: "web-game" },
      { label: "互动故事", value: "interactive-story" },
      { label: "素材画布", value: "asset-canvas" },
      { label: "Godot", value: "godot-game" },
    ]);
  });

  it("keeps Asset Canvas out of the home game types", () => {
    expect(GAME_PROJECT_TYPES.map(({ value }) => value)).toEqual(["web-game", "interactive-story", "godot-game"]);
  });

  it("provides labels and default names", () => {
    expect(projectTypeLabel("interactive-story")).toBe("互动故事");
    expect(defaultProjectName("interactive-story")).toBe("未命名故事");
    expect(defaultProjectName("web-game")).toBe("未命名项目");
  });
});
