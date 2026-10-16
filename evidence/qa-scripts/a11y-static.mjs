// G on the routes that need no RPC: home, newsroom onboarding, malformed link, unknown page. Also text contrast of the palette.
import { serve, launch, watch, PROJECT } from '/tmp/qa/lib.mjs'
import { auditPage, contrast } from '/tmp/qa/a11y-lib.mjs'

const problems = []
const srv = await serve(PROJECT + '/dist')
const browser = await launch('chromium')
const out = []
for (const [name, hash] of [['home', '#/'], ['newsroom (onboarding)', '#/newsroom'], ['malformed link', '#/send/0x123/abc'], ['unknown page', '#/nope']]) {
  const page = await browser.newPage()
  watch(page, name, problems)
  await page.goto(srv.url + hash)
  await page.waitForSelector('h1')
  const a = await auditPage(page)
  out.push(`${name}: lang=${a.facts.lang} title="${a.facts.title}" h1=${a.facts.h1} main=${a.facts.main} fields=${a.facts.fields} unlabeled=${a.facts.unlabeled.length} unnamed=${a.facts.unnamed.length} tabStops=${a.stops.length}/${a.reachable} noFocusRing=${a.noRing.length}`)
  if (a.facts.unlabeled.length) out.push('  unlabeled: ' + a.facts.unlabeled.join(' | '))
  if (a.facts.unnamed.length) out.push('  unnamed: ' + a.facts.unnamed.join(' | '))
  if (a.noRing.length) out.push('  no ring: ' + a.noRing.join(' | '))
  await page.close()
}
await browser.close()
await srv.close()
const pairs = [
  ['light text', '#16181d', '#fbfaf7'], ['light muted', '#4a505c', '#fbfaf7'], ['light muted on card', '#4a505c', '#ffffff'], ['light link', '#0b5cad', '#fbfaf7'], ['light button', '#ffffff', '#0b5cad'], ['light danger', '#a1181d', '#fbfaf7'], ['light ok', '#176334', '#fbfaf7'],
  ['dark text', '#f2f3f5', '#121418'], ['dark muted', '#b4bac5', '#121418'], ['dark link', '#7db7f5', '#121418'], ['dark button', '#07121f', '#7db7f5'], ['dark danger', '#ff8d90', '#1b1e24'], ['dark ok', '#7fd9a0', '#121418'],
]
out.push('contrast: ' + pairs.map(([n, f, b]) => `${n} ${contrast(f, b).toFixed(1)}`).join(', '))
console.log(out.join('\n'))
console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'console/page errors: 0')
