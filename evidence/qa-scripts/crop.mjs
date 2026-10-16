// usage: node crop.mjs <png> <y> <height> <out>   crops a full-page screenshot (780 px wide) at natural size
import { writeFileSync } from 'node:fs'
import { launch } from '/tmp/qa/lib.mjs'
const [png, y, hgt, out] = process.argv.slice(2)
writeFileSync('/tmp/qa/crop.html', `<body style="margin:0"><div style="width:780px;height:${hgt}px;background:url('file://${png}') 0 -${y}px no-repeat"></div></body>`)
const browser = await launch('chromium')
const page = await browser.newPage()
await page.setViewport({ width: 780, height: Number(hgt), deviceScaleFactor: 1 })
await page.goto('file:///tmp/qa/crop.html')
await page.screenshot({ path: out })
await browser.close()
