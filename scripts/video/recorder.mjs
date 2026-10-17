// Headless-Chromium screen recorder for the demo video (puppeteer-core + CDP screencast, no desktop capture).
//  * one fresh profile per run (--user-data-dir in a temp dir), no extensions, no logins, one browser context per page
//  * frames are saved with the renderer's own timestamps and encoded to constant-30-fps H.264 tagged bt709
//  * a pointer dot and a click ripple are injected into the recorded page only (recording script, never app code)
//  * every step is wrapped in a privacy check (page text + field values vs tools/privacy-denylist.txt, counts only)
//  * every RPC call the pages make is counted in media/raw/ledger.json so live takes stay inside the public budget
import { createServer } from 'node:http'
import { appendFileSync, createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join, resolve } from 'node:path'
import puppeteer from 'puppeteer-core'
import { FPS, H, RAW, W } from './config.mjs'
import { denyCount, round3, run } from './lib.mjs'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const now = () => Date.now() / 1000

// ---- local preview of a built site at /sealdrop/ ---------------------------------------------------------------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' }
export function serveSite(dir, base = '/sealdrop/') {
  const server = createServer((req, res) => {
    let p = decodeURIComponent((req.url ?? '/').split('?')[0].split('#')[0])
    if (!p.startsWith(base)) { res.writeHead(302, { location: base }); return res.end() }
    p = p.slice(base.length) || 'index.html'
    const file = resolve(dir, p.endsWith('/') ? p + 'index.html' : p)
    if (!file.startsWith(resolve(dir)) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end('not found') }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
    createReadStream(file).pipe(res)
  })
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${server.address().port}`, base, close: () => server.close() })))
}

// ---- the injected pointer (CSP-safe: CSSOM and Web Animations only, no <style>, no style attributes) --------------
function cursorInit() {
  if (window.top !== window) return
  const NS = 'http://www.w3.org/2000/svg'
  let cur = null, x = -100, y = -100, shown = false, hidden = false
  const css = (el, o) => { for (const k in o) el.style[k] = o[k] }
  const build = () => {
    if (cur && cur.isConnected) return
    const root = document.documentElement
    if (!root) return
    cur = document.createElement('div')
    css(cur, { position: 'fixed', left: '0px', top: '0px', width: '0px', height: '0px', zIndex: '2147483647', pointerEvents: 'none', opacity: shown && !hidden ? '1' : '0', transform: `translate(${x}px, ${y}px)` })
    const svg = document.createElementNS(NS, 'svg')
    for (const [k, v] of [['width', '28'], ['height', '28'], ['viewBox', '0 0 28 28']]) svg.setAttribute(k, v)
    css(svg, { position: 'absolute', left: '-2px', top: '-2px', overflow: 'visible', filter: 'drop-shadow(0px 2px 3px rgba(0,0,0,0.45))' })
    const path = document.createElementNS(NS, 'path')
    for (const [k, v] of [['d', 'M3 2 L3 21 L8 16.5 L11.2 24 L14.2 22.7 L11 15.4 L17.5 15.4 Z'], ['fill', '#ffffff'], ['stroke', '#0e1113'], ['stroke-width', '1.6'], ['stroke-linejoin', 'round']]) path.setAttribute(k, v)
    svg.append(path)
    cur.append(svg)
    root.append(cur)
  }
  const place = () => { build(); if (!cur) return; css(cur, { opacity: shown && !hidden ? '1' : '0', transform: `translate(${x}px, ${y}px)` }) }
  window.addEventListener('mousemove', (e) => { x = e.clientX; y = e.clientY; shown = true; place() }, true)
  window.addEventListener('mousedown', (e) => {
    x = e.clientX; y = e.clientY; shown = true; place()
    if (hidden) return
    const r = document.createElement('div')
    css(r, { position: 'fixed', left: `${x - 28}px`, top: `${y - 28}px`, width: '56px', height: '56px', borderRadius: '50%', border: '3px solid #8fe0e5', background: 'rgba(110,195,200,0.30)', boxSizing: 'border-box', pointerEvents: 'none', zIndex: '2147483646' })
    document.documentElement.append(r)
    r.animate([{ transform: 'scale(0.35)', opacity: 1 }, { transform: 'scale(1.0)', opacity: 0.9, offset: 0.45 }, { transform: 'scale(1.45)', opacity: 0 }], { duration: 720, easing: 'ease-out' }).onfinish = () => r.remove()
    if (cur) cur.animate([{ transform: `translate(${x}px, ${y}px) scale(1)` }, { transform: `translate(${x}px, ${y}px) scale(0.84)` }, { transform: `translate(${x}px, ${y}px) scale(1)` }], { duration: 240 })
  }, true)
  window.__cursorVisible = (v) => { hidden = !v; place() }
}

// ---- RPC ledger -------------------------------------------------------------------------------------------------
const LEDGER = resolve(RAW, 'ledger.json')
export const ledgerRead = () => (existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : [])
/** arkiv_query calls made by earlier takes in the last `minutes` minutes (the public RPC meters these). */
export const queriesInLast = (minutes = 60) => ledgerRead().filter((e) => e.t > now() - minutes * 60).reduce((n, e) => n + (e.arkiv_query ?? 0), 0)

export class Ledger {
  constructor(take) { this.take = take; this.counts = {}; this.limited = false }
  attach(page, cam) {
    page.on('request', (r) => {
      if (r.method() !== 'POST' || /^https?:\/\/(127\.0\.0\.1|localhost)/.test(r.url())) return
      const body = r.postData() ?? ''
      for (const m of body.matchAll(/"method"\s*:\s*"([a-z_A-Z0-9]+)"/g)) this.counts[m[1]] = (this.counts[m[1]] ?? 0) + 1
      this.counts.requests = (this.counts.requests ?? 0) + 1
    })
    page.on('response', (r) => { if (r.status() === 429 && !/^https?:\/\/(127\.0\.0\.1|localhost)/.test(r.url())) { this.limited = true; console.error(`[${cam}] HTTP 429 from ${new URL(r.url()).host}`) } })
  }
  save() {
    mkdirSync(RAW, { recursive: true })
    const all = ledgerRead().filter((e) => e.take !== this.take)
    all.push({ take: this.take, t: now(), ...this.counts, limited: this.limited })
    writeFileSync(LEDGER, JSON.stringify(all, null, 1))
  }
}

// ---- browser + cameras -----------------------------------------------------------------------------------------
export async function launch() {
  const profile = mkdtempSync(join(tmpdir(), 'sealdrop-video-profile-'))
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium', headless: true, userDataDir: profile, defaultViewport: null,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions', '--no-first-run', '--no-default-browser-check', '--force-color-profile=srgb', '--hide-scrollbars', '--lang=en-US', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  })
  const close = async () => { await browser.close().catch(() => {}); rmSync(profile, { recursive: true, force: true }) }
  return { browser, close }
}

export class Cam {
  /** @param {string} name  @param {string} origin permissions are granted to this origin only */
  static async create(browser, name, dir, { origin, scheme = 'dark', view = { width: W, height: H, deviceScaleFactor: 1 }, ledger } = {}) {
    const ctx = await browser.createBrowserContext()
    if (origin) await ctx.overridePermissions(origin, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write'])
    const page = await ctx.newPage()
    await page.setViewport(view)
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }])
    await page.emulateTimezone('UTC')
    await page.evaluateOnNewDocument(cursorInit)
    const cdp = await page.createCDPSession()
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true })
    const cam = new Cam(name, page, cdp, resolve(dir, name))
    ledger?.attach(page, name)
    page.on('console', (m) => { if (m.type() === 'error') cam.errors.push(m.text().slice(0, 200)) })
    page.on('pageerror', (e) => cam.errors.push(String(e).slice(0, 200)))
    return cam
  }

  constructor(name, page, cdp, dir) {
    Object.assign(this, { name, page, cdp, dir, frames: [], events: [], errors: [], x: 1120, y: 600, rng: mulberry32(7) })
    mkdirSync(join(dir, 'frames'), { recursive: true })
  }

  ev(name, extra = {}) { const e = { t: now(), cam: this.name, name, ...extra }; this.events.push(e); return e }

  async startRecording() {
    this.cdp.on('Page.screencastFrame', (f) => {
      const file = join(this.dir, 'frames', `${String(this.frames.length).padStart(6, '0')}.jpg`)
      writeFileSync(file, Buffer.from(f.data, 'base64'))
      this.frames.push({ ts: f.metadata.timestamp, recv: now(), file })
      this.cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
    })
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 2 })
    this.recording = true
    this.ev('rec_start')
    // A page that is completely still (it was just screenshotted) emits no frame until something changes, which would start
    // the clip late. Moving the pointer 1 px and back is the only nudge that worked (tried bringToFront, metrics, repaints).
    for (let i = 0; i < 10 && !this.frames.length; i++) {
      await this.page.mouse.move(this.x + 1, this.y)
      await this.page.mouse.move(this.x, this.y)
      await sleep(150)
    }
    if (!this.frames.length) throw new Error(`${this.name}: the screencast delivered no first frame`)
  }

  /** Stops the screencast and encodes frames.ffconcat -> clip.mp4; returns t0 (wall clock of video time 0) and stats. */
  async stopAndEncode(endTs = now()) {
    await this.cdp.send('Page.stopScreencast').catch(() => {})
    this.recording = false
    await sleep(150)
    const fr = this.frames
    if (!fr.length) throw new Error(`${this.name}: no frames captured`)
    const lines = ['ffconcat version 1.0']
    fr.forEach((f, i) => { lines.push(`file '${f.file}'`, `duration ${Math.max(0.001, (i + 1 < fr.length ? fr[i + 1].ts : Math.max(endTs, f.ts + 0.04)) - f.ts).toFixed(4)}`) })
    lines.push(`file '${fr.at(-1).file}'`)
    writeFileSync(join(this.dir, 'frames.ffconcat'), lines.join('\n') + '\n')
    const out = join(this.dir, 'clip.mp4')
    await run('ffmpeg', ['-y', '-v', 'error', '-nostdin', '-f', 'concat', '-safe', '0', '-i', join(this.dir, 'frames.ffconcat'),
      '-vf', `fps=${FPS}:round=near,scale=in_range=pc:in_color_matrix=bt601:out_range=tv:out_color_matrix=bt709:flags=accurate_rnd+full_chroma_int,format=yuv420p,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv`,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-an', '-movflags', '+faststart', out])
    const gaps = fr.slice(1).map((f, i) => f.ts - fr[i].ts)
    const lat = fr.map((f) => f.recv - f.ts).sort((a, b) => a - b)
    const info = { cam: this.name, mp4: out, t0: round3(fr[0].ts), frames: fr.length, seconds: round3(Math.max(endTs, fr.at(-1).ts) - fr[0].ts), max_gap: round3(Math.max(0, ...gaps)), latency_median: round3(lat[lat.length >> 1]), latency_max: round3(lat.at(-1)), errors: this.errors.slice(0, 5) }
    writeFileSync(join(this.dir, 'info.json'), JSON.stringify({ ...info, events: this.events }, null, 1))
    return info
  }

  // ---- human-paced input --------------------------------------------------------------------------------------
  async goto(url, readySelector) {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' })
    if (readySelector) await this.waitFor(readySelector)
    await this.page.mouse.move(this.x, this.y) // makes the injected pointer reappear after a navigation
  }

  async waitFor(selector, ms = 40000, { visible = true } = {}) {
    await this.page.waitForSelector(selector, { visible, timeout: ms })
  }

  async waitText(selector, re, ms = 40000) {
    await this.page.waitForFunction((s, src) => new RegExp(src).test(document.querySelector(s)?.textContent ?? ''), { timeout: ms }, selector, re.source)
  }

  async glide(x, y, seconds = 0.7) {
    const n = Math.max(6, Math.round(seconds * 60)), x0 = this.x, y0 = this.y, t0 = performance.now()
    for (let i = 1; i <= n; i++) {
      const k = i / n, e = k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2 // ease in-out
      await this.page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e)
      const wait = t0 + (i * seconds * 1000) / n - performance.now()
      if (wait > 0) await sleep(wait)
    }
    this.x = x; this.y = y
  }

  /** Native smooth scroll to an absolute y; resolves once the position has stopped changing. */
  async scrollY(y) {
    await this.page.evaluate((v) => window.scrollTo({ top: v, behavior: 'smooth' }), y)
    let last = -1, same = 0
    for (let i = 0; i < 100 && same < 4; i++) { await sleep(50); const cur = await this.page.evaluate(() => Math.round(scrollY)); same = cur === last ? same + 1 : 0; last = cur }
  }

  /** Scrolls so the element sits at `frac` of the viewport height. */
  async scrollToEl(selector, frac = 0.4) {
    const y = await this.page.$eval(selector, (e, f) => Math.max(0, Math.round(e.getBoundingClientRect().top + scrollY - innerHeight * f)), frac)
    await this.scrollY(y)
  }

  /** Scrolls the element into view if needed (smoothly), glides the pointer onto it and returns its centre. */
  async point(selector, { seconds = 0.75, dx = 0, dy = 0 } = {}) {
    const el = await this.page.waitForSelector(selector, { visible: true, timeout: 20000 })
    const r = await el.boundingBox()
    const vh = await this.page.evaluate(() => innerHeight)
    const rel = await el.evaluate((e) => e.getBoundingClientRect().top)
    if (rel < 20 || rel + r.height > vh - 20) await this.scrollToEl(selector, 0.5)
    const b = await el.boundingBox()
    const x = b.x + b.width / 2 + dx, y = b.y + b.height / 2 + dy
    await this.glide(x, y, seconds)
    return { el, x, y }
  }

  async click(selector, opts = {}) {
    if (/renew|burn|forget|danger/.test(selector)) throw new Error(`refusing to click ${selector} (must never be clicked in a take)`)
    const { x, y } = await this.point(selector, opts)
    await sleep(220)
    this.ev('click', { selector })
    await this.page.mouse.down(); await sleep(70); await this.page.mouse.up()
    return { x, y }
  }

  async type(selector, text, { cps = 11, seconds } = {}) {
    await this.click(selector, seconds ? { seconds } : {})
    await sleep(350)
    this.ev('type_start', { selector })
    for (const ch of text) {
      await this.page.keyboard.type(ch)
      const base = 1000 / cps, jitter = (this.rng() - 0.5) * base * 0.8
      await sleep(base + jitter + (/[ ,.:]/.test(ch) ? base * 0.9 : 0))
    }
    this.ev('type_end', { selector })
  }

  /** document.body.innerText + every input/textarea value + title + url, counted against the denylist. Throws on any hit. */
  async privacy(label) {
    const text = await this.page.evaluate(() => [document.title, location.href, document.body?.innerText ?? '', ...[...document.querySelectorAll('input,textarea')].map((e) => e.value)].join('\n'))
    const n = await denyCount(text)
    this.ev('privacy', { label, hits: n, chars: text.length })
    appendFileSync(resolve(RAW, 'privacy-log.txt'), `${new Date().toISOString()} ${this.name} ${label} hits=${n} chars=${text.length}\n`)
    if (n) throw new Error(`privacy check hit (${n}) on ${this.name}:${label}`)
    return text
  }

  async still(path) {
    await this.page.evaluate(() => window.__cursorVisible?.(false))
    await sleep(120)
    await this.page.screenshot({ path, type: 'png' })
    await this.page.evaluate(() => window.__cursorVisible?.(true))
  }
}

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

/** Runs one named step with a hard timeout so a hung RPC (the SDK waits out a 429) aborts the take instead of stalling it. */
export async function step(name, fn, ms = 45000, ledger) {
  let timer
  const t0 = performance.now()
  try {
    const r = await Promise.race([fn(), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`step "${name}" timed out after ${ms / 1000} s`)), ms) })])
    console.log(`  ok   ${name} (${((performance.now() - t0) / 1000).toFixed(1)} s)`)
    return r
  } catch (e) {
    console.error(`  FAIL ${name}: ${e.message}${ledger?.limited ? ' [RPC answered 429]' : ''}`)
    throw e
  } finally { clearTimeout(timer) }
}
