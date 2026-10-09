import type { FastifyInstance } from "fastify";
import type { ProjectManager } from "./projects.js";
import type { RestorationStore } from "./restoration.js";
import { StudioError } from "./studio-files.js";
import { StudioExporter } from "./studio-export.js";
import type { Restoration, StudioTarget } from "../shared/studio.js";

export function registerStudioRoutes(app: FastifyInstance, projects: ProjectManager, store: RestorationStore, runtimes: string[], isBusy: (id: string) => boolean, capacitorTools: string[] = []): void {
  const exporter = new StudioExporter(projects, store, runtimes, capacitorTools);
  const wrap = <T>(action: () => Promise<T>) => action().catch(error => {
    if (error instanceof StudioError) throw error;
    throw new StudioError(error instanceof Error ? error.message : String(error));
  });
  app.post<{ Body: { sourcePath: string; name?: string; goal: string; storageMode?: "copy" | "in-place" } }>("/studio/import", { schema: { body: {
    type: "object", additionalProperties: false, required: ["sourcePath", "goal"], properties: {
      storageMode: { enum: ["copy", "in-place"] },
      sourcePath: { type: "string", minLength: 1, maxLength: 4096 }, name: { type: "string", maxLength: 120 }, goal: { type: "string", minLength: 1, maxLength: 2000 },
    },
  } } }, request => wrap(() => store.import(request.body.sourcePath, request.body.name ?? "", request.body.goal, request.body.storageMode)));
  app.get<{ Params: { projectId: string } }>("/projects/:projectId/studio", request => wrap(() => store.state(request.params.projectId)));
  app.patch<{ Params: { projectId: string }; Body: { state?: Restoration["state"]; route?: Restoration["route"] } }>("/projects/:projectId/studio/restoration", { schema: { body: {
    type: "object", additionalProperties: false, minProperties: 1, properties: { state: { enum: ["ready", "paused"] }, route: { enum: ["repair", "rebuild", "remake"] } },
  } } }, request => wrap(async () => { if (isBusy(request.params.projectId)) throw new StudioError("请先在对话中停止正在执行的任务。", 409); return store.update(request.params.projectId, request.body); }));
  app.post<{ Params: { projectId: string } }>("/projects/:projectId/studio/rollback", request => wrap(async () => {
    if (isBusy(request.params.projectId)) throw new StudioError("请先停止 AI 任务，再回滚工作副本。", 409);
    return store.rollback(request.params.projectId);
  }));
  app.post<{ Params: { projectId: string }; Body: { target: StudioTarget; sourceDirectory: string } }>("/projects/:projectId/studio/exports", { schema: { body: {
    type: "object", additionalProperties: false, required: ["target", "sourceDirectory"], properties: { target: { enum: ["web", "windows", "macos", "android", "ios"] }, sourceDirectory: { type: "string", minLength: 1, maxLength: 1000 } },
  } } }, request => wrap(async () => {
    if (isBusy(request.params.projectId)) throw new StudioError("请等待当前 AI 修改结束，再导出稳定版本。", 409);
    return exporter.generate(request.params.projectId, request.body.target, request.body.sourceDirectory);
  }));
}
