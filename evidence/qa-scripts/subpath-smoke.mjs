// J: the smoke test against a BASE_PATH=/sealdrop/ build served under /sealdrop/ (how GitHub Pages serves a project page).
// usage: BASE_PATH=/sealdrop/ npm run build && cp -r dist /tmp/qa/dist-sub-N && npm run build && node /tmp/qa/subpath-smoke.mjs /tmp/qa/dist-sub-N
import { spawn } from 'node:child_process'
import { serve, PROJECT } from './lib.mjs'
const srv = await serve(process.argv[2], { prefix: '/sealdrop/' })
console.log('serving', srv.url)
const p = spawn('npm', ['run', 'smoke'], { cwd: PROJECT, env: { ...process.env, SMOKE_URL: srv.url }, stdio: 'inherit' })
p.on('exit', async (code) => { await srv.close(); process.exit(code ?? 1) })
