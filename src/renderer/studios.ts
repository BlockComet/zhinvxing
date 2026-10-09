import type { ProjectState, ProjectType } from "../shared/contracts.js";

export type GameStudioType = Exclude<ProjectType, "asset-canvas">;

export const GAME_STUDIOS = {
  "web-game": {
    page: "web-game",
    title: "今天想做什么游戏？",
    placeholder: "描述你想创作的浏览器游戏…",
    newLabel: "新建游戏",
  },
  "interactive-story": {
    page: "interactive-story",
    title: "今天想讲什么故事？",
    placeholder: "描述你想创作的互动故事…",
    newLabel: "新建故事",
  },
  "godot-game": {
    page: "godot",
    title: "想用 Godot 创作什么？",
    placeholder: "描述你想创作的 Godot 游戏…",
    newLabel: "新建 Godot 项目",
  },
} as const;

export function recentStudioProjects(
  projects: readonly ProjectState[],
  type: GameStudioType,
  limit = 4,
): ProjectState[] {
  return projects
    .filter((project) => project.type === type)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit);
}
