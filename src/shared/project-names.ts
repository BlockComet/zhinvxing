import type { ProjectType } from "./contracts.js";

export function defaultProjectName(type: ProjectType): string {
  if (type === "interactive-story") return "未命名故事";
  if (type === "asset-canvas") return "未命名素材画布";
  return "未命名项目";
}
