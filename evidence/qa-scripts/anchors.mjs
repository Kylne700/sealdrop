// Recompute every src/arkiv.ts#L anchor in SUBMISSION.md from the symbol named in its link text. --write to apply.
import { readFileSync, writeFileSync } from 'node:fs'
const root = '/path/to/sealdrop/'
const src = readFileSync(root + 'src/arkiv.ts', 'utf8').split('\n')
let doc = readFileSync(root + 'SUBMISSION.md', 'utf8')
const find = (sym) => src.findIndex((l) => new RegExp(`^export (async )?(function|const) ${sym}\\b`).test(l)) + 1
let bad = 0
doc = doc.replace(/\[`([A-Za-z0-9_]+)`\]\(([^)]*src\/arkiv\.ts)#L(\d+)\)/g, (m, sym, path, old) => {
  const now = find(sym)
  const ok = now > 0
  if (!ok) bad++
  console.log(`${sym.padEnd(22)} #L${old} -> #L${now || '??'}   ${ok ? src[now - 1].trim().slice(0, 70) : 'SYMBOL NOT FOUND'}`)
  return ok ? `[\`${sym}\`](${path}#L${now})` : m
})
if (process.argv.includes('--write')) writeFileSync(root + 'SUBMISSION.md', doc)
console.log(bad ? `${bad} unresolved` : 'all anchors resolve to their declaration' + (process.argv.includes('--write') ? ' (written)' : ' (dry run)'))
