import fs from 'node:fs';
import ts from 'typescript';
const pairs = [
['Attached image ', '附件图片 '],['Working for ', '已工作 '],['You stopped after ', '已停止，用时 '],['Worked for ', '用时 '],
['Viewed ', '已查看 '],['Reconnecting ', '正在重连 '],['Tool result image ', '工具返回的图片 '],['Preparing ', '正在准备 '],['Running ', '正在运行 '],['Ran ', '已运行 '],['Used ', '已使用 '],
['Request failed with ', '请求失败，状态码 '],['Event stream failed with ', '事件连接失败，状态码 '],['Authentication stream failed with ', '身份验证连接失败，状态码 '],
['Asset actions for ', '素材操作：'],['Could not save canvas: ', '无法保存画布：'],['Could not sync canvas. Your edits are kept. ', '无法同步画布，修改已保留。'],
['Could not download: ', '无法下载：'],['Could not send asset: ', '无法发送素材：'],['This mode can accept ', '此模式还可添加 '],[' more reference images.', ' 张参考图片。'],
['Image ', '图片 '],['This mode supports up to ', '此模式最多支持 '],[' images. Remove extra images or switch reference mode.', ' 张图片。请移除多余图片或切换参考模式。'],
['Move ', '动作 '],['Recheck ', '重新检查 '],['Remove ', '移除 '],['Pause ', '暂停 '],['Play ', '播放 '],['Unmute ', '取消静音 '],['Mute ', '静音 '],
['Generate ', '生成 '],[' again', '（重新生成）'],['Download ', '下载 '],['View ', '视图 '],['Connected ', '已连接 '],['Missing ', '缺失 '],
['Image unavailable: ', '图片不可用：'],['Node details: ', '节点详情：'],['Board options: ', '画板选项：'],['Rename ', '重命名 '],['Open in ', '使用以下应用打开：'],['Show in ', '在以下位置显示：'],['Collapse ', '折叠 '],['Expand ', '展开 '],
['Could not read dropped folder: ', '无法读取拖入的文件夹：'],['Delete “', '删除「'],['”?', '」？'],['Edit ', '编辑 '],['Fetched the first ', '已获取前 '],[' models. Other model IDs can be added manually.', ' 个模型，其他模型 ID 可手动添加。'],['Fetched ', '已获取 '],[' models.', ' 个模型。'],
['Enable ', '启用 '],['Edit model ', '编辑模型 '],['Could not read ', '无法读取 '],['Loading 3D model ', '正在加载 3D 模型 '],['Text model: ', '语言模型：'],[' · Reasoning: ', ' · 推理：'],
['Provider labels: ', '服务商标签：'],['Paste your ', '请粘贴 '],[' API key', ' API 密钥'],['Use ', '使用 '],[' as the default image model', '作为默认图片模型'],
['Step ', '步骤 '],['Could not save your changes: ', '无法保存更改：'],['Taken ', '截图时间：'],['Could not ask the AI: ', '无法请求 AI：'],['Could not change the text: ', '无法修改文本：'],['Could not move it: ', '无法移动：'],['Could not add ', '无法添加 '],['Could not remove the background: ', '无法移除背景：'],['Could not upload: ', '无法上传：'],['Could not open the Library: ', '无法打开素材库：'],
['Would go back to ', '将返回 '],['Would restart at ', '将从这里重新开始：'],['Would continue at ', '将从这里继续：'],['Would open ', '将打开 '],['Could not keep which Scenes were seen: ', '无法保存场景访问记录：'],
['Show more (', '显示更多（'],['Try ', '试用 '],['Uninstall “', '卸载「'],['Open ', '打开 '],['Agent ', 'AI 助手 '],['Project actions for ', '项目操作：'],['Workspace: ', '工作区：'],['Show ', '显示 '],['Delete ', '删除 '],
['Could not add to ', '无法添加到 '],['Update available: ', '有可用更新：'],['Downloading update (', '正在下载更新（'],['Ready to restart: ', '重启后更新至：'],['Sign in with ', '使用以下账号登录：'],['Could not read the duration of ', '无法读取文件时长：'],
];
const mapping = new Map(pairs);
for(const file of fs.readdirSync('src/renderer').filter(x=>/\.tsx?$/.test(x))){
 const name='src/renderer/'+file; let text=fs.readFileSync(name,'utf8'); const src=ts.createSourceFile(file,text,99,true); const edits=[];
 const visit=n=>{if(ts.isTemplateHead(n)||ts.isTemplateMiddle(n)||ts.isTemplateTail(n)){
   const translated=mapping.get(n.text); if(translated){ const raw=n.getText(src); const prefix=1;const suffix=ts.isTemplateTail(n)?1:2;edits.push({start:n.getStart(src)+prefix,end:n.getEnd()-suffix,value:translated}); }
 }ts.forEachChild(n,visit)};visit(src);
 for(const e of edits.sort((a,b)=>b.start-a.start))text=text.slice(0,e.start)+e.value+text.slice(e.end);
 text=text.replaceAll('"en-US"','"zh-CN"');
 if(file==='coding-workspace.tsx') text=text.replace('["ArrowDown", "ArrowUp", "首页", "End"]','["ArrowDown", "ArrowUp", "Home", "End"]').replace('event.key === "首页"','event.key === "Home"');
 if(file==='app-sidebar.tsx') text=text.replace('>STUDIOS<','>创作工作室<');
 if(file==='settings-page.tsx') text=text.replace('>SETTINGS<','>设置<');
 if(file==='custom-provider-dialog.tsx') text=text.replace('{enabledCount} enabled','已启用 {enabledCount}');
 if(file==='project-card.tsx') text=text.replace('`Edited ${minutes}m ago`','`${minutes} 分钟前编辑`').replace('`Edited ${hours}h ago`','`${hours} 小时前编辑`').replace('`Edited ${days}d ago`','`${days} 天前编辑`').replace('`Edited ${updatedAt.', '`编辑于 ${updatedAt.');
 fs.writeFileSync(name,text);
}
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));pkg.version='0.0.0-beta.4-zh.1';fs.writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n');
