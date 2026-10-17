// Slides for story steps 1, 4 and 5 (and the cover image): plain HTML in the app's dark design tokens, rendered to PNG
// by headless Chromium. One state per narrated beat; cut.mjs turns each PNG into a still clip, FilmCraft dissolves between them.
//   node scripts/video/slides.mjs            writes media/raw/slides/<beat>.png and media/raw/slides/cover.png
// Colours, fonts and radii are copied from src/style.css (dark scheme). Everything on a slide is a claim already made in
// README.md, arkiv/schema.md or the narration; the bottom 110 px stay empty because FilmCraft burns the captions there.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { H, LIVE_URL, RAW, REPO_URL, W } from './config.mjs'
import { parseNarration } from './narration.mjs'
import { launch } from './recorder.mjs'

const CSS = `
:root{--paper:#0e1113;--surface:#161a1d;--surface-2:#1d2327;--ink:#ecebe5;--muted:#a7adb3;--line:#2b3338;--line-strong:#6f7a82;
--accent:#6ec3c8;--accent-hover:#8fd3d7;--accent-fg:#04191b;--accent-soft:#15292b;--danger:#ff9f97;--danger-soft:#2e1816;--track:#2a3236;
--serif:Charter,'Bitstream Charter','Iowan Old Style','Palatino Linotype',Palatino,Georgia,'Noto Serif',serif;
--sans:system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans','Helvetica Neue',Arial,sans-serif;
--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,'DejaVu Sans Mono','Liberation Mono',monospace}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;background:var(--paper);color:var(--ink);font-family:var(--sans);overflow:hidden}
body{position:relative;background:radial-gradient(900px 420px at 12% -8%,#15292b 0%,transparent 70%),var(--paper)}
.top{position:absolute;left:56px;right:56px;top:34px;display:flex;justify-content:space-between;align-items:center}
.brand{display:flex;gap:11px;align-items:center;font:700 25px var(--serif)}
.brand svg{width:34px;height:34px}
.pill{font:600 17px var(--sans);color:var(--accent);background:var(--accent-soft);border:1px solid var(--line);border-radius:999px;padding:7px 18px;letter-spacing:.01em}
.main{position:absolute;left:56px;right:56px;top:104px;height:500px}
.eyebrow{font:700 17px var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin-bottom:18px}
h1{font:700 118px/1 var(--serif);letter-spacing:-.01em}
h2{font:700 56px/1.08 var(--serif);letter-spacing:-.005em}
.lead{font:400 36px/1.3 var(--serif);color:#d6d4cc;margin-top:22px;max-width:760px}
.muted{color:var(--muted)}
.mark-box{fill:var(--accent-soft);stroke:var(--accent);stroke-width:2}
.mark-flap{fill:none;stroke:var(--accent);stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.mark-seal{fill:var(--accent)}
.ico{width:76px;height:76px;fill:none;stroke:var(--accent);stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.ico .f{fill:var(--accent);stroke:none}
.cards{display:flex;gap:26px;margin-top:40px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:26px 28px}
.card.tile{flex:1;display:flex;flex-direction:column;gap:18px;align-items:flex-start}
.card.tile b{font:700 31px var(--serif)}
.card.tile span{font:400 22px/1.35 var(--sans);color:var(--muted)}
.chips{display:flex;gap:20px;margin-top:34px}
.chip{font:700 40px var(--serif);border-radius:999px;padding:14px 34px;background:var(--danger-soft);color:var(--danger);border:1px solid #5a2c28}
.chip.ok{background:var(--accent-soft);color:var(--accent);border-color:var(--line)}
.row{display:flex;gap:56px;align-items:center}
.glow{width:330px;height:330px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle,#15292b 0%,#112023 55%,transparent 72%)}
.glow svg{width:230px;height:230px}
.mono{font-family:var(--mono)}
.soft{opacity:.34;transition:none}
.on{opacity:1}
/* step 4: entity cards on the left, protocol features on the right */
.arkiv{display:flex;gap:30px;height:500px}
.col{display:flex;flex-direction:column;gap:20px}
.ent{width:570px;padding:20px 24px;border-radius:16px;background:var(--surface);border:1px solid var(--line)}
.ent.dim{opacity:.22}
.ent h3{font:700 27px var(--serif);display:flex;justify-content:space-between;align-items:baseline}
.ent h3 small{font:600 15px var(--sans);color:var(--muted);letter-spacing:.04em}
.kv{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.kv code{font:600 16px var(--mono);background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:4px 10px;color:#d6d4cc}
.line{margin-top:11px;font:400 19px/1.3 var(--sans);color:var(--muted)}
.line b{color:var(--ink);font-weight:600}
.bar{height:9px;border-radius:9px;background:var(--track);margin-top:9px;overflow:hidden}
.bar i{display:block;height:100%;background:var(--accent);border-radius:9px}
.feat{display:flex;gap:16px;align-items:flex-start;padding:15px 20px;border-radius:14px;background:var(--surface);border:1px solid var(--line);width:560px}
.feat.on{border-color:var(--accent);background:var(--accent-soft)}
.feat .n{flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:var(--surface-2);color:var(--accent);font:700 18px var(--sans)}
.feat.on .n{background:var(--accent);color:var(--accent-fg)}
.feat b{display:block;font:700 22px var(--serif)}
.feat span{display:block;margin-top:3px;font:400 18px/1.3 var(--sans);color:var(--muted)}
.feat.soft{opacity:.38}
.off-panel{margin-top:6px;padding:16px 22px;border-radius:14px;border:1px dashed var(--line-strong);width:560px;font:400 19px/1.35 var(--sans);color:var(--muted)}
.off-panel b{display:block;font:700 22px var(--serif);color:var(--ink);margin-bottom:4px}
.off-panel.on{border:1px solid var(--accent);background:var(--accent-soft);color:#d6d4cc}
.foot{position:absolute;left:56px;right:56px;bottom:136px;display:flex;gap:40px;align-items:center;font:600 24px var(--mono);color:var(--accent)}
.foot small{font:400 18px var(--sans);color:var(--muted)}
`

const MARK = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect class="mark-box" x="3" y="7" width="26" height="19" rx="4.5"/><path class="mark-flap" d="M5 10 16 18.5 27 10"/><circle class="mark-seal" cx="16" cy="18.5" r="3.6"/></svg>`
const ICON = {
  server: `<svg class="ico" viewBox="0 0 64 64"><rect x="9" y="10" width="46" height="17" rx="4"/><rect x="9" y="31" width="46" height="17" rx="4"/><circle class="f" cx="18" cy="18.5" r="2.2"/><circle class="f" cx="18" cy="39.5" r="2.2"/><path d="M28 18.5h19M28 39.5h19M24 52v6M40 52v6M16 58h32"/></svg>`,
  wall: `<svg class="ico" viewBox="0 0 64 64"><rect x="8" y="10" width="48" height="44" rx="5"/><path d="M8 24.7h48M8 39.3h48M32 10v14.7M20 24.7v14.6M44 24.7v14.6M32 39.3V54"/></svg>`,
  gap: `<svg class="ico" viewBox="0 0 64 64"><rect x="10" y="14" width="34" height="24" rx="3.5"/><path d="M5 46h44M26 38v8"/><path d="M52 22l8 8M60 22l-8 8" /><path d="M46 26h2" stroke-dasharray="1 5"/></svg>`,
  person: `<svg class="ico" viewBox="0 0 64 64"><circle cx="32" cy="22" r="10"/><path d="M12 56c0-12 9-19 20-19s20 7 20 19"/></svg>`,
}
const page = (pill, inner, extra = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Sealdrop</title><style>${CSS}${extra}</style></head><body>
<div class="top"><div class="brand">${MARK}Sealdrop</div>${pill ? `<div class="pill">${pill}</div>` : ''}</div>${inner}</body></html>`

// ---- step 1: the problem ----------------------------------------------------------------------------------------
const P1 = '1 · The problem'
const step1 = {
  's1-1': () => page(P1, `<div class="main row"><div style="flex:1">
    <div class="eyebrow">Arkiv Global Tour Stop · Privacy</div><h1>Sealdrop</h1>
    <p class="lead" style="max-width:760px">An encrypted, self-expiring tip line with no Sealdrop server to seize.</p>
    <p class="lead muted" style="font-size:26px;margin-top:16px;font-family:var(--sans)">SecureDrop's idea, on Arkiv.</p></div>
    <div class="glow">${MARK.replace('aria-hidden', 'style="filter:drop-shadow(0 6px 24px #0b3a3e)" aria-hidden')}</div></div>`),
  // the facts on this slide are the README's account of SecureDrop's own installation guide (checked 2026-10-16)
  's1-2': () => page(P1, `<div class="main"><div class="eyebrow">The standard answer: SecureDrop</div>
    <h2>It asks the newsroom to host its own hardware</h2>
    <div class="cards" style="margin-top:30px">
      <div class="card tile">${ICON.server}<b>Two servers</b><span>An application server and a monitor server, as physical hardware.</span></div>
      <div class="card tile">${ICON.wall}<b>A firewall</b><span>A dedicated network firewall.</span></div>
      <div class="card tile">${ICON.gap}<b>Air-gapped machines</b><span>Computers that boot to Tails.</span></div></div>
    <p class="muted" style="font:400 22px var(--sans);margin-top:22px">Its public directory lists 24 instances (checked 2026-10-16).</p></div>`),
  's1-3': () => page(P1, `<div class="main row" style="gap:64px"><div style="flex:none" class="glow">${ICON.server.replace('class="ico"', 'class="ico" style="width:190px;height:190px"')}</div>
    <div style="flex:1"><div class="eyebrow">A tip line that runs on a server is one place to</div>
    <div class="chips" style="flex-wrap:wrap;margin-top:12px"><span class="chip">seize</span><span class="chip">subpoena</span><span class="chip">switch off</span></div></div></div>`),
}

// ---- step 4: how it uses Arkiv ------------------------------------------------------------------------------------
const P4 = '4 · How it uses Arkiv'
const stateKey = { 's4-1': 'attrs', 's4-2': 'expire', 's4-3': 'owner', 's4-4': 'extend', 's4-5': 'off' }
function step4(id) {
  const k = stateKey[id], hit = (...keys) => (keys.includes(k) ? 'on' : 'soft')
  const dim = k === 'off' ? ' dim' : ''
  return page(P4, `<div class="main arkiv"><div class="col">
    <div class="ent${dim}"><h3>Inbox entity <small>one per newsroom</small></h3>
      <div class="kv ${hit('attrs')}"><code>type = inbox</code><code>app = sealdrop-v1</code><code>inbox_id = …</code></div>
      <div class="line soft"><b>Payload:</b> public key, name, description</div>
      <div class="line ${hit('expire', 'extend')}"><b>Lease:</b> 7 days, renewed by the newsroom<div class="bar"><i style="width:92%"></i></div></div></div>
    <div class="ent${dim}"><h3>Tip entity <small>one per tip</small></h3>
      <div class="kv ${hit('attrs')}"><code>type = tip</code><code>app = sealdrop-v1</code><code>inbox = 0x…</code></div>
      <div class="line soft"><b>Payload:</b> ciphertext, padded to 1, 4, 16 or 64 KiB</div>
      <div class="line ${hit('owner')}"><b>$owner</b> the newsroom, after a hand-over in the same transaction</div>
      <div class="line ${hit('expire')}"><b>Lease:</b> 1 to 30 days, chosen by the source<div class="bar"><i style="width:60%"></i></div></div></div></div>
    <div class="col" style="gap:14px">
      <div class="feat ${hit('attrs')}"><span class="n">1</span><div><b>Typed attributes, range queries</b><span class="mono" style="font-size:16px">type · app · inbox · $expiresAt · $createdAt</span></div></div>
      <div class="feat ${hit('expire')}"><span class="n">2</span><div><b>Entity Expiration</b><span>Each lease is enforced by the protocol.</span></div></div>
      <div class="feat ${hit('owner')}"><span class="n">3</span><div><b>$creator and $owner</b><span>Load only the linked address's inbox; hand each tip over.</span></div></div>
      <div class="feat ${hit('extend')}"><span class="n">4</span><div><b>Lifetime Extension + events</b><span>Renew the inbox; feed the live view over a WebSocket.</span></div></div>
      <div class="off-panel ${hit('off')}"><b>Stays off Arkiv</b>Private keys and plaintext live only in the browsers.</div></div></div>`,
    `.main{top:96px}.feat{padding:11px 18px}.feat b{font-size:21px}.feat span{font-size:17px}.ent{padding:16px 22px}.ent h3{font-size:25px}.line{font-size:18px;margin-top:9px}.off-panel{padding:12px 20px;font-size:18px;margin-top:2px}.off-panel b{font-size:21px}`)
}

// ---- step 5: honest limits and the end card -----------------------------------------------------------------------
const P5 = '5 · Honest limits'
const step5 = {
  's5-1': () => page(P5, `<div class="main row"><div style="flex:1"><div class="eyebrow">Before you try it</div><h1 style="font-size:104px">Honest limits</h1>
    <p class="lead muted">What Sealdrop does not protect.</p></div></div>`),
  's5-2': () => page(P5, `<div class="main"><div class="eyebrow">Two limits, from the README</div>
    <div class="cards" style="margin-top:14px">
      <div class="card tile" style="min-height:300px;gap:14px">${ICON.person}<b style="font-size:34px">Your network address</b><span style="font-size:24px">The RPC node, and the WebSocket, see your IP address. Use Tor Browser.</span></div>
      <div class="card tile" style="min-height:300px;gap:14px">${ICON.server}<b style="font-size:34px">Ciphertext stays in history</b><span style="font-size:24px">After Entity Expiration a tip is gone from queries, but its ciphertext stays in chain history.</span></div></div></div>`),
  's5-3': () => page(P5, `<div class="main"><div class="eyebrow">Testnet prototype</div>
    <div class="cards" style="margin-top:14px">
      <div class="card tile" style="min-height:230px;flex:1.2"><b style="font-size:34px">Made-up messages only</b><span style="font-size:24px">Built on the Arkiv Tiramisu testnet for the Arkiv Global Tour Stop. MIT licence.</span></div>
      <div class="card tile" style="min-height:230px;border-color:var(--accent);background:var(--accent-soft)"><b style="font-size:34px">The friction we hit</b><span class="mono" style="font-size:26px;color:var(--accent)">arkiv/friction.md</span></div></div></div>`),
  // closing card under the last spoken line (it holds END_TAIL after the last word), so it can use the whole frame
  's5-4': () => page('', `<div class="main row" style="top:96px"><div style="flex:1"><div class="eyebrow">Arkiv Global Tour Stop · Privacy</div><h1>Sealdrop</h1>
    <div class="cards" style="flex-direction:column;gap:14px;margin-top:34px;max-width:760px">
      <div class="card" style="display:flex;gap:26px;align-items:baseline;padding:16px 26px"><span class="muted" style="font:700 17px var(--sans);letter-spacing:.12em;width:64px">CODE</span><span class="mono" style="font-size:28px;color:var(--accent)">${REPO_URL}</span></div>
      <div class="card" style="display:flex;gap:26px;align-items:baseline;padding:16px 26px"><span class="muted" style="font:700 17px var(--sans);letter-spacing:.12em;width:64px">LIVE</span><span class="mono" style="font-size:28px;color:var(--accent)">${LIVE_URL}</span></div></div></div>
    <div class="glow">${MARK.replace('aria-hidden', 'style="filter:drop-shadow(0 6px 24px #0b3a3e)" aria-hidden')}</div></div>`),
}

// ---- cover image, 1200 x 630 --------------------------------------------------------------------------------------
const cover = () => page('', `<div class="main row" style="top:96px;height:440px"><div style="flex:1"><div class="eyebrow">Arkiv Global Tour Stop · Privacy</div>
  <h1 style="font-size:132px">Sealdrop</h1><p class="lead" style="font-size:36px;max-width:720px">An encrypted, self-expiring tip line with no Sealdrop server to seize.</p>
  <p class="lead muted" style="font-size:26px;margin-top:22px;font-family:var(--sans)">Sealed in the browser · stored on Arkiv · gone on the date the source picks</p></div>
  <div class="glow" style="width:300px;height:300px">${MARK.replace('aria-hidden', 'style="width:210px;height:210px" aria-hidden')}</div></div>`,
  `html,body{width:1200px;height:630px}.top{top:28px}.main{left:64px;right:64px}`)

export function slideFor(id) {
  if (step1[id]) return step1[id]()
  if (step5[id]) return step5[id]()
  if (stateKey[id]) return step4(id)
  return null
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = resolve(RAW, 'slides')
  mkdirSync(dir, { recursive: true })
  const ids = parseNarration().filter((s) => [1, 4, 5].includes(s.n)).flatMap((s) => s.beats.map((b) => b.id))
  const missing = ids.filter((id) => !slideFor(id))
  if (missing.length) throw new Error(`no slide for beat(s) ${missing.join(', ')}: add them to scripts/video/slides.mjs`)
  const { browser, close } = await launch()
  try {
    const shot = async (html, name, w = W, h = H) => {
      const p = await browser.newPage()
      await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 })
      await p.setContent(html, { waitUntil: 'load' })
      await p.evaluate(() => document.fonts.ready)
      writeFileSync(resolve(dir, name + '.html'), html)
      await p.screenshot({ path: resolve(dir, name + '.png'), type: 'png' })
      await p.close()
    }
    for (const id of ids) await shot(slideFor(id), id)
    await shot(cover(), 'cover', 1200, 630)
    console.log(`slides: ${ids.length} states (the last is the end card) + cover in media/raw/slides/`)
  } finally { await close() }
}
