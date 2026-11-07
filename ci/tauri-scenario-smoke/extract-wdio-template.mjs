// ori-generate SKILL.md の wdio template (wdio.conf.ts / tsconfig.json) を抽出し、
// placeholder を置換して scenario dir に書き出す。SKILL template が実際に動くことを
// tauri-scenario-smoke で CI ガードするための決定的 generate 代替 (LLM generate は通さない)。
//
// Usage: node extract-wdio-template.mjs <SKILL.md> <scenario-dir> <app> <scenario-id>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [skillPath, outDir, app, scenarioId] = process.argv.slice(2);
if (!skillPath || !outDir || !app || !scenarioId) {
  console.error('usage: extract-wdio-template.mjs <SKILL.md> <scenario-dir> <app> <scenario-id>');
  process.exit(2);
}

const lines = readFileSync(skillPath, 'utf8').split('\n');

// marker 行の後に現れる最初の fenced block (```<lang>) の中身を返す
function blockAfter(markerPredicate, lang, label) {
  const start = lines.findIndex(markerPredicate);
  if (start < 0) throw new Error(`${label}: marker が SKILL.md に見つからない (template 見出し変更?)`);
  const open = lines.findIndex((l, i) => i > start && l.trim() === '```' + lang);
  if (open < 0) throw new Error(`${label}: marker 後に \`\`\`${lang} block が無い`);
  const close = lines.findIndex((l, i) => i > open && l.trim() === '```');
  if (close < 0) throw new Error(`${label}: fenced block が閉じていない`);
  return lines.slice(open + 1, close).join('\n') + '\n';
}

const wdioConf = blockAfter((l) => l.startsWith('**wdio**（local tauri 駆動の例'), 'typescript', 'wdio.conf.ts');
// tsconfig は wdio 用 types を持つ json block (playwright の段落直後に置かれている)
const tsconfig = blockAfter((l) => l.includes('wdio は `@wdio/globals/types`'), 'json', 'tsconfig.json');

if (!tsconfig.includes('@wdio/globals/types')) throw new Error('tsconfig.json: wdio 用 types を含む block ではない');
for (const needle of ["driverProvider: 'external'", 'SevereServiceError', 'ORI_SCENARIO_TMP', 'maxInstances: 1']) {
  if (!wdioConf.includes(needle)) throw new Error(`wdio.conf.ts: template に ${needle} が無い`);
}

const render = (s) => s.replaceAll('<app>', app).replaceAll('<id>', scenarioId);
const conf = render(wdioConf);
writeFileSync(join(outDir, 'wdio.conf.ts'), conf);
writeFileSync(join(outDir, 'tsconfig.json'), render(tsconfig));
console.log(`extracted wdio.conf.ts + tsconfig.json → ${outDir}`);
