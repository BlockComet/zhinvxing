import type { ProjectState } from "../shared/contracts.js";

export function projectDeletionConfirmation(project: ProjectState): string {
  if (project.workspaceLocation === "external") {
    return `从织女星中移除“${project.name}”？“${project.workspacePath}”中的文件会保留在磁盘上。`;
  }
  return `删除「${project.name}”? This cannot be undone.`;
}
