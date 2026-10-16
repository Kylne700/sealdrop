// Fails if any secret value from .env.local appears in a tracked or staged file. Prints counts only.
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
if (!existsSync(new URL('../.env.local', import.meta.url))) { console.log('secret scan: SKIP (no .env.local, so there are no secrets to look for)'); process.exit(0) }
const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('=')).filter(([k]) => !k.startsWith('VITE_') || k.includes('PRIVATE'))
let bad = 0
for (const [name, ...rest] of env) {
  const value = rest.join('=')
  if (value.length < 20) continue
  for (const args of [['grep', '-lF', '--cached', value], ['grep', '-lF', value]]) {
    try { const out = execFileSync('git', args, { encoding: 'utf8' }).trim(); if (out) { bad++; console.log(`LEAK ${name} in: ${out.split('\n').join(', ')}`) } } catch { /* exit 1 = no match */ }
  }
}
console.log(bad ? `secret scan: ${bad} problem(s)` : `secret scan: clean (${env.length} secrets checked against tracked and staged files)`)
process.exit(bad ? 1 : 0)
