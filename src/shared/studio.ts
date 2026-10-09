export type StudioTarget = "web" | "windows" | "macos" | "android" | "ios";
export interface SourceEvidence { path: string; size: number; sha256: string; }
export interface Finding { certainty: "confirmed" | "inferred" | "unknown"; message: string; evidence: string[]; }
export interface Restoration {
  version: 1;
  projectId: string;
  goal: string;
  createdAt: string;
  state: "ready" | "paused";
  route: "repair" | "rebuild" | "remake";
  sourceName: string;
  files: SourceEvidence[];
  findings: Finding[];
  milestones: Array<{ name: string; status: "done" | "pending" | "blocked"; detail: string }>;
}
export interface StudioExport {
  id: string;
  target: StudioTarget;
  createdAt: string;
  directory: string;
  status: "project-generated" | "built";
  artifact?: string;
  sha256?: string;
  verification: "not-run";
  nativeProject?: boolean;
  notes: string[];
}
export interface StudioState { restoration?: Restoration; exports: StudioExport[]; }
