import { Plus, RefreshCw } from "./icons.js";
import { useEffect, useRef, useState } from "react";
import type { PluginMention, ProjectState, ProjectType, PromptAttachment, PromptImage, PromptMode } from "../shared/contracts.js";
import { deleteProject, duplicateProject, listProjects, renameProject, waitForRuntime } from "./api.js";
import { ExampleShelf, useExamples } from "./examples.js";
import { AppSidebar } from "./app-sidebar.js";
import { ProjectCard } from "./project-card.js";
import { ProjectCreateDialog } from "./project-create-dialog.js";
import { ProjectRenameDialog } from "./project-rename-dialog.js";
import { projectDeletionConfirmation } from "./project-deletion.js";
import { ProjectPromptCreator } from "./project-prompt-creator.js";
import { GAME_PROJECT_TYPES } from "./project-types.js";
import { projectsHash, type AppNavigationTarget } from "./routes.js";
import { WindowDragRegion } from "./window-drag-region.js";
import { useProjectShelfLayout } from "./use-project-shelf-layout.js";
import "./studios.css";
import { StudioCenter } from "./studio-center.js";

interface HomeProps {
  onNavigate: (page: AppNavigationTarget) => void;
  onCreate: (projectId: string, conversationId: string, prompt: string, mentions: PluginMention[], images: PromptImage[], mode: PromptMode, attachments?: PromptAttachment[]) => void;
  onOpen: (projectId: string) => void;
}

export function Home({ onNavigate, onCreate, onOpen }: HomeProps) {
  const [projects, setProjects] = useState<ProjectState[]>([]);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string>();
  const [projectActionError, setProjectActionError] = useState<string>();
  const [projectType, setProjectType] = useState<ProjectType>("web-game");
  const [createOpen, setCreateOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ProjectState>();
  const renameTrigger = useRef<HTMLElement | null>(null);
  const { examples, covers: exampleCovers } = useExamples();
  const { sectionRef, columns, recentProjectLimit } = useProjectShelfLayout();

  async function loadProjects() {
    setPhase("loading");
    setLoadError(undefined);
    try {
      await waitForRuntime();
      setProjects(await listProjects());
      setPhase("ready");
    } catch (error) {
      setLoadError(errorMessage(error));
      setPhase("error");
    }
  }

  useEffect(() => { void loadProjects(); }, []);
  async function rename(project: ProjectState, input: string) {
    const name = input.trim();
    if (!name || name === project.name) return;
    await runProjectAction(() => renameProject(project.id, name));
  }

  async function duplicate(project: ProjectState) {
    await runProjectAction(() => duplicateProject(project.id));
  }

  async function remove(project: ProjectState) {
    if (!window.confirm(projectDeletionConfirmation(project))) return;
    await runProjectAction(() => deleteProject(project.id));
  }

  async function runProjectAction(action: () => Promise<unknown>) {
    setProjectActionError(undefined);
    try {
      await action();
      await loadProjects();
    } catch (error) {
      setProjectActionError(errorMessage(error));
    }
  }

  const visibleProjects = projects.slice(0, recentProjectLimit);
  const visibleExamples = examples.slice(0, columns);

  return (
    <main className="home-shell">
      <AppSidebar active="home" onNavigate={onNavigate} />

      <section className="home-content home-content-fitted">
        <WindowDragRegion />
        <div className="home-start">
          <h1>今天想做点什么？</h1>
          <button className="studio-entry" type="button" onClick={() => setCreateOpen(true)}>创造新游戏</button>
          <button className="studio-entry" type="button" onClick={() => setRestoreOpen(true)}>复原已有游戏</button>
          <a className="studio-entry" href={projectsHash()}>继续项目</a>
          <ProjectPromptCreator
            projectType={projectType}
            projectTypes={GAME_PROJECT_TYPES}
            placeholder="描述你想创作的游戏…"
            onProjectTypeChange={setProjectType}
            onOpenProject={onOpen}
            onCreate={onCreate}
          />
          <button className="home-start-blank" type="button" onClick={() => setCreateOpen(true)}>
            <Plus size={14} />从空白开始
          </button>
        </div>

        <section ref={sectionRef} className="home-recent studio-projects" aria-labelledby="projects-heading">
          <div className="studio-section-heading">
            <h2 id="projects-heading">最近的项目</h2>
            {phase === "error" ? (
              <button className="studio-text-link" type="button" onClick={() => void loadProjects()}>
                <RefreshCw size={14} />重试
              </button>
            ) : projects.length > recentProjectLimit ? (
              <a className="studio-text-link" href={projectsHash()}>显示全部</a>
            ) : null}
          </div>

          {phase === "loading" ? <ProjectGridSkeleton count={recentProjectLimit} /> : null}
          {phase === "error" ? <p className="home-project-state" role="alert">{loadError}</p> : null}
          {phase === "ready" && projects.length === 0 ? (
            <p className="home-project-state">
              暂无项目
            </p>
          ) : null}
          {phase === "ready" && projects.length > 0 ? (
            <div className="studio-project-grid">
              {visibleProjects.map((project, index) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  fallback={index % 4}
                  onOpen={() => onOpen(project.id)}
                  actions={{ onRename: () => {
                    renameTrigger.current = document.querySelector<HTMLElement>('.project-card-menu[aria-expanded="true"]');
                    setRenameTarget(project);
                  }, onDuplicate: () => void duplicate(project), onDelete: () => void remove(project) }}
                />
              ))}
            </div>
          ) : null}
          {projectActionError ? <p className="home-notice" role="alert">{projectActionError}</p> : null}
        </section>
        {visibleExamples.length > 0 ? <section className="home-discover home-explore studio-examples" aria-labelledby="home-examples-heading">
          <div className="studio-section-heading"><h2 id="home-examples-heading">探索</h2></div>
          <ExampleShelf examples={visibleExamples} covers={exampleCovers} showType onOpenProject={onOpen} />
        </section> : null}
      </section>
      {renameTarget ? <ProjectRenameDialog name={renameTarget.name} returnFocus={renameTrigger.current} onClose={() => setRenameTarget(undefined)} onConfirm={(name) => {
        const project = renameTarget;
        setRenameTarget(undefined);
        void rename(project, name);
      }} /> : null}
      {createOpen ? <ProjectCreateDialog initialType={projectType} projectTypes={GAME_PROJECT_TYPES} onClose={() => setCreateOpen(false)} onCreated={(project) => {
        setCreateOpen(false);
        onOpen(project.id);
      }} /> : null}
      {restoreOpen ? <StudioCenter onClose={() => setRestoreOpen(false)} onOpen={id => { setRestoreOpen(false); onOpen(id); }} /> : null}
    </main>
  );
}

function ProjectGridSkeleton({ count }: { count: number }) {
  return (
    <div className="studio-project-grid" aria-label="正在加载项目">
      {Array.from({ length: count }, (_, item) => <div className="studio-project-skeleton" key={item} />)}
    </div>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
