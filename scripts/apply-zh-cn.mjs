// One-time source migration. Only curated static strings are translated;
// user text, model identifiers, API enums and DOM nodes are not rewritten.
import ts from 'typescript';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const inventory = JSON.parse(readFileSync('localization-inventory.json', 'utf8'));
const translations = new Map(readFileSync('scripts/zh-cn-translations.txt', 'utf8').trim().split(/\r?\n/).map(line => {
  const [, id, value] = line.match(/^(\d+) (.+)$/);
  return [inventory[Number(id)].text, value];
}));
let count = 0;
for (const name of readdirSync('src/renderer')) {
  if (!/\.(tsx|ts)$/.test(name) || name === 'desktop-window-frame.tsx') continue;
  const file = path.join('src/renderer', name);
  let text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const edits = [];
  const visit = node => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) {
      const key = node.text.replace(/\s+/g, ' ').trim();
      const translation = translations.get(key);
      const parent = node.parent;
      const isKey = (ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent)) && parent.name === node;
      const isProtocol = ts.isLiteralTypeNode(parent) || ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isElementAccessExpression(parent);
      let protectedValue = key === 'Home' && !ts.isJsxText(node) && !ts.isJsxAttribute(parent);
      for (let ancestor = parent; ancestor && ancestor !== source; ancestor = ancestor.parent) {
        if (ts.isPropertyAssignment(ancestor) && ancestor.name.getText(source) === 'assetOrigin') protectedValue = true;
      }
      if (translation && !isKey && !isProtocol && !protectedValue) {
        const start = node.getStart(source);
        const end = node.getEnd();
        const original = text.slice(start, end);
        const value = ts.isJsxText(node)
          ? original.replace(/\S[\s\S]*\S|\S/, translation)
          : JSON.stringify(node.text.match(/^\s*/)[0] + translation + node.text.match(/\s*$/)[0]);
        edits.push({start,end,value});
      }
    }
    ts.forEachChild(node,visit);
  }; visit(source);
  for(const edit of edits.sort((a,b)=>b.start-a.start)) text=text.slice(0,edit.start)+edit.value+text.slice(edit.end);
  if(edits.length) { writeFileSync(file,text); count+=edits.length; }
}
writeFileSync('scripts/zh-cn-catalog.json',JSON.stringify(Object.fromEntries(translations),null,2)+'\n');
console.log(`Translated ${count} static occurrences from ${translations.size} curated messages.`);
