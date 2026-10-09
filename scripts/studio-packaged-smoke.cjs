const fs=require('node:fs/promises');const path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const daemonRoot=process.versions.electron ? path.join(path.dirname(process.execPath),'resources/app.asar/dist/daemon') : path.resolve('dist/daemon');
 const {ProjectManager}=await import(pathToFileURL(path.join(daemonRoot,'projects.js')));
 const {RestorationStore}=await import(pathToFileURL(path.join(daemonRoot,'restoration.js')));
 const {StudioExporter}=await import(pathToFileURL(path.join(daemonRoot,'studio-export.js')));
 const root=path.join(process.env.APPDATA,'ohmygame-studio-runtime-test',String(Date.now()));
 const projects=new ProjectManager(root);await projects.load();const store=new RestorationStore(root,projects);
 const source=JSON.parse(await fs.readFile('.runtime/studio-smoke-result.json','utf8')).project.workspacePath;
 const imported=await store.import(path.join(source,'dist'),'打包环境验证','复制与导出');
 const exeRoot=path.dirname(process.execPath);
 const exporter=new StudioExporter(projects,store,[exeRoot],[path.join(exeRoot,'resources/capacitor-tools')]);
 for(const target of ['windows','android']){
  const result=await exporter.generate(imported.projectId,target,'restoration-work');
  if(target==='windows' && result.status!=='built') throw new Error('Windows runtime not found');
  if(target==='android' && !result.nativeProject) throw new Error(await fs.readFile(path.join(result.directory,'native-generation.log'),'utf8'));
  console.log(JSON.stringify({target,status:result.status,nativeProject:result.nativeProject}));
 }
 console.log('Electron packaged-runtime import and exports passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
