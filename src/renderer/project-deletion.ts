import type { ProjectState } from "../shared/contracts.js";

export function projectDeletionConfirmation(project: ProjectState): string {
  if (project.workspaceLocation === "external") {
    return `Remove “${project.name}” from OhMyGame? Files in “${project.workspacePath}” will remain on disk.`;
  }
  return `删除「${project.name}”? This cannot be undone.`;
}
