import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { ProjectManager } from '../src/daemon/projects.js';
import { RestorationStore } from '../src/daemon/restoration.js';
import { StudioExporter } from '../src/daemon/studio-export.js';
const root = path.resolve('.runtime/studio-smoke');
const projects = new ProjectManager(root);
await projects.load();
const project = await projects.create('跨平台验证 · 星星收集');
const dist = path.join(project.workspacePath, 'dist');
await mkdir(dist, {recursive:true});
await writeFile(path.join(dist, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>星星收集 · 运行验证</title><style>body{margin:0;background:#101d35;color:#eaf0ff;font:20px system-ui;text-align:center}main{padding:60px 15px}button{font-size:30px;padding:35px;background:#f2c568;border:0;border-radius:50%;cursor:pointer}p{color:#b2c8e8}</style><main><h1>星星收集</h1><p>点击星星，验证鼠标／触控输入和存档</p><button id="star" aria-label="收集星星">★</button><h2 id="score"></h2><p id="result"></p></main><script>let n=Number(localStorage.getItem('stars')||0);function draw(){document.getElementById('score').textContent='已收集 '+n+' 颗星星';document.getElementById('result').textContent=n>=3?'目标达成：已收集三颗星星':'目标：收集三颗星星'}document.getElementById('star').onclick=()=>{n++;localStorage.setItem('stars',String(n));draw()};draw();</script></html>`);
const store = new RestorationStore(root, projects);
const exporter = new StudioExporter(projects, store, [path.resolve('.runtime/electron')], [path.resolve('.runtime/capacitor-tools')]);
const results = [];
for(const target of ['web','windows','android','ios'] as const){
  const result=await exporter.generate(project.id,target,'dist');results.push(result);
  console.log(JSON.stringify({target,status:result.status,nativeProject:result.nativeProject,artifact:result.artifact,directory:result.directory,notes:result.notes}));
}
await writeFile(path.resolve('.runtime/studio-smoke-result.json'), JSON.stringify({project,results},null,2));
const android=results.find(r=>r.target==='android')!;
if(!android.nativeProject) throw new Error('Android native project generation failed');
await readFile(path.join(android.directory,'android/app/src/main/AndroidManifest.xml'));
await readFile(path.join(android.directory,'android/app/src/main/assets/public/index.html'));
