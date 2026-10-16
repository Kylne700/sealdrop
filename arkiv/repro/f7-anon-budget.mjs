// Friction F7: the public RPC meters arkiv_query with an anonymous cost budget that the docs do not describe, and
// answers 429 + Retry-After when it is spent. viem (under the SDK) then waits for Retry-After instead of failing.
//
//   node arkiv/repro/f7-anon-budget.mjs            part 1: 5 small queries against the public RPC, prints the metering headers.
//                                                   Safe: it stops at the first 429 and never retries.
//   node arkiv/repro/f7-anon-budget.mjs --local     part 2: a local fake server that answers 429 + "Retry-After: 2"; times how long
//                                                   the SDK's query() takes to fail. Makes no request to Arkiv.
//
// Optional: a different RPC URL as the last argument.
import http from 'node:http'
import { http as viemHttp } from 'viem'
import { createPublicClient } from '@arkiv-network/sdk'
import { tiramisu } from '@arkiv-network/sdk/chains'

const local = process.argv.includes('--local')
const urlArg = process.argv.slice(2).find((a) => a.startsWith('http'))
const RPC = urlArg ?? 'https://rpc.tiramisu.db-chain.testnet.arkiv.network'
const DESK = '0x6a3C43407F58B11E871310cE296eb3bF1a3fdcF6'
const KEY_ONLY = { key: true }
const WITH_PAYLOAD = { key: true, owner: true, creator: true, payload: true }

if (local) {
  const server = http.createServer((req, res) => {
    req.resume()
    res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '2', ratelimit: 'limit=10000, remaining=0, reset=2' })
    res.end(JSON.stringify({ error: 'ANON_COST_LIMITED', message: 'unauthenticated query budget exhausted' }))
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const client = createPublicClient({ chain: tiramisu, transport: viemHttp(`http://127.0.0.1:${server.address().port}`) })
  const t0 = Date.now()
  try {
    await client.query("type = str('tip')")
    console.log('unexpected: the query succeeded')
  } catch (e) {
    console.log(`SDK query() rejected after ${((Date.now() - t0) / 1000).toFixed(1)} s with ${e.name}; server saw Retry-After: 2`)
  }
  server.close()
  process.exit(0)
}

const cases = [
  ['match everything, 1 row, key only', '*', { limit: '0x1', select: KEY_ONLY }],
  ['inboxes, 5 rows, key only', "type = str('inbox') AND app = str('sealdrop-v1')", { limit: '0x5', select: KEY_ONLY }],
  ['inboxes, 5 rows, with payload', "type = str('inbox') AND app = str('sealdrop-v1')", { limit: '0x5', select: WITH_PAYLOAD }],
  ['one creator, key only', `type = str('inbox') AND app = str('sealdrop-v1') AND $creator = addr(${DESK})`, { limit: '0x14', select: KEY_ONLY }],
  ['tips, 20 rows, with payload', "type = str('tip') AND app = str('sealdrop-v1')", { limit: '0x14', select: WITH_PAYLOAD }],
]
const pick = (h, re) => [...h.entries()].filter(([k]) => re.test(k)).map(([k, v]) => `${k}: ${v}`).join(' | ')

for (const [label, query, opts] of cases) {
  const res = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'arkiv_query', params: [query, opts] }) })
  const meter = pick(res.headers, /^(ratelimit|retry-after|arkiv-)/i) || '(no metering headers)'
  if (res.status === 429) {
    console.log(`${label}\n  HTTP 429  ${meter}\n  body: ${(await res.text()).slice(0, 300)}\n  stopping here; do not retry before Retry-After`)
    break
  }
  const rows = (await res.json()).result?.data?.length
  console.log(`${label}\n  HTTP ${res.status}  rows: ${rows}  ${meter}`)
}
