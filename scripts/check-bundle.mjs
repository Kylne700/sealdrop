// Checks the built site against the key rules in the README. Prints PASS/FAIL per rule and never a secret value.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// The rules compare dist/ against the secrets in .env.local. A fresh clone has neither file yet: say so instead of crashing.
const envFile = new URL('../.env.local', import.meta.url)
if (!existsSync(envFile)) {
  console.log('SKIP  bundle check: there is no .env.local, so there are no secret values to look for in dist/ (`npm run keys` creates it).')
  process.exit(0)
}
if (!existsSync(new URL('../dist/index.html', import.meta.url))) {
  console.log('FAIL  dist/ is missing: run `npm run build` first.')
  process.exit(1)
}
const env = Object.fromEntries(
  readFileSync(envFile, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const dist = new URL('../dist/', import.meta.url).pathname
const files = []
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path)
    else files.push(path)
  }
}
walk(dist)
const text = files.map((f) => readFileSync(f, 'latin1')).join('\n').toLowerCase()
const has = (secret) => text.includes(secret.toLowerCase().replace(/^0x/, ''))

let failed = 0
const rule = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++ }

rule(files.length > 0, `dist/ has ${files.length} files`)
rule(has(env.VITE_DEMO_SENDER_PRIVATE_KEY), 'demo-sender key is in the bundle (public testnet-only demo affordance, by design)')
for (const name of ['FUNDER_PRIVATE_KEY', 'DEMO_DESK_PRIVATE_KEY', 'DEMO_DESK_BOX_SECRET']) {
  rule(Boolean(env[name]) && !has(env[name]), `${name} is NOT in the bundle`)
}
rule(!files.some((f) => /\.env/.test(f)), 'no .env file in dist/')
console.log(failed ? `bundle check: ${failed} failure(s)` : 'bundle check: all rules pass')
process.exit(failed ? 1 : 0)
