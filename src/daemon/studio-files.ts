import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, realpath, mkdir, copyFile, chmod } from "node:fs/promises";
import path from "node:path";
import type { SourceEvidence } from "../shared/studio.js";

export class StudioError extends Error { constructor(message: string, readonly statusCode = 400) { super(message); } }
export async function digest(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
export function inside(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel === "" || (!path.isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${path.sep}`));
}
// Reject links rather than following them outside an imported or exported tree.
export async function inventory(root: string): Promise<SourceEvidence[]> {
  root = await realpath(root);
  const results: SourceEvidence[] = [];
  let bytes = 0;
  async function visit(relative: string): Promise<void> {
    const absolute = path.join(root, relative);
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink() || !inside(root, await realpath(absolute))) throw new StudioError(`不接受符号链接或目录联接：${relative}`);
    if (stat.isDirectory()) {
      for (const name of (await readdir(absolute)).sort()) await visit(path.join(relative, name));
    } else if (stat.isFile()) {
      bytes += stat.size;
      if (results.length >= 30_000 || bytes > 20 * 1024 ** 3) throw new StudioError("本次导入上限为 30000 个文件、20 GB，请分批整理材料。");
      results.push({ path: relative.split(path.sep).join("/"), size: stat.size, sha256: await digest(absolute) });
    } else throw new StudioError(`不支持的文件类型：${relative}`);
  }
  await visit("");
  return results;
}
export async function copyInventory(source: string, destination: string, files: SourceEvidence[]): Promise<void> {
  // Windows packaged processes may virtualize AppData without a filesystem link.
  // Compare canonical roots to canonical children, not redirected logical paths.
  source = await realpath(source);
  for (const file of files) {
    const from = path.resolve(source, file.path);
    const to = path.resolve(destination, file.path);
    if (!inside(source, from) || !inside(destination, to)) throw new StudioError("非法文件路径");
    if ((await lstat(from)).isSymbolicLink() || !inside(source, await realpath(from))) throw new StudioError("文件在复制前变成了链接");
    await mkdir(path.dirname(to), { recursive: true });
    await copyFile(from, to);
    await chmod(to, 0o600);
    if (await digest(to) !== file.sha256) throw new StudioError(`材料在导入期间发生变化：${file.path}`);
  }
}
