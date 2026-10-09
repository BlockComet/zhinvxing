import ts from 'typescript';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const entries = new Map();
for (const name of readdirSync('src/renderer')) {
  if (!/\.(tsx|ts)$/.test(name)) continue;
  const file = path.join('src/renderer', name);
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const visit = node => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) {
      const text = node.text.replace(/\s+/g, ' ').trim();
      if (/[A-Za-z]/.test(text) && (/^[A-Z][a-z]/.test(text) || text.includes(' ')) && text.length < 1500 && !text.includes('className=')) {
        const files = entries.get(text) ?? []; if (!files.includes(name)) files.push(name); entries.set(text, files);
      }
    }
    ts.forEachChild(node, visit);
  }; visit(source);
}
writeFileSync('localization-inventory.json', JSON.stringify([...entries].map(([text,files])=>({text,files})),null,2));
console.log(entries.size);
