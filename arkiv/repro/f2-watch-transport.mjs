// Friction F2: what watchEntityEvents actually does on each transport. Read-only, no key.
// node arkiv/repro/f2-watch-transport.mjs
import { createPublicClient } from '@arkiv-network/sdk'
import { tiramisu } from '@arkiv-network/sdk/chains'
import { http, webSocket } from 'viem'

const seconds = 10
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const tally = {}
const note = (kind, method) => { tally[kind] ??= {}; tally[kind][method] = (tally[kind][method] ?? 0) + 1 }

const realFetch = globalThis.fetch
globalThis.fetch = async (url, init) => { try { note('http', JSON.parse(init.body).method) } catch {} return realFetch(url, init) }
const RealWS = globalThis.WebSocket
globalThis.WebSocket = class extends RealWS {
  send(d) { try { note('websocket', JSON.parse(d).method) } catch {} return super.send(d) }
}

for (const [label, transport] of [['http', http()], ['websocket', webSocket()]]) {
  const client = createPublicClient({ chain: tiramisu, transport })
  let events = 0
  const unwatch = client.watchEntityEvents({ onEvent: () => { events++ }, onError: (e) => console.log(label, 'error', e.message) })
  await sleep(seconds * 1000)
  unwatch()
  console.log(`${label.padEnd(9)} ${seconds}s: ${events} events; RPC calls sent:`, JSON.stringify(tally[label]))
}
process.exit(0)
