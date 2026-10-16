// Reads and decrypts the tips of a Sealdrop inbox using NOTHING from this repository: a raw JSON-RPC call to
// a public Arkiv node plus tweetnacl, written from the wire format in arkiv/schema.md. Anyone can do this
// without asking Sealdrop for anything.
//
//   INBOX=0x<inbox entity key> OWNER=0x<newsroom address> BOX_SECRET=<base64 secret key> node arkiv/examples/read-tips.mjs
//
// Needs `npm ci` once (tweetnacl). Without BOX_SECRET it still lists the public side of every tip.
import nacl from 'tweetnacl'

const RPC = process.env.RPC ?? 'https://rpc.tiramisu.db-chain.testnet.arkiv.network'
const { INBOX, OWNER, BOX_SECRET } = process.env
if (!INBOX || !OWNER) throw new Error('Set INBOX (inbox entity key) and OWNER (the newsroom address).')

// A tip is valid only if the newsroom owns it: anyone can create entities that merely mention the inbox.
const query = `type = str('tip') AND app = str('sealdrop-v1') AND inbox = key(${INBOX}) AND $owner = addr(${OWNER})`
const secretKey = BOX_SECRET ? Uint8Array.from(Buffer.from(BOX_SECRET, 'base64')) : undefined

function open(sealed) {
  if (!secretKey || sealed[0] !== 1) return null // wire version 1
  const padded = nacl.box.open(sealed.subarray(57), sealed.subarray(33, 57), sealed.subarray(1, 33), secretKey)
  if (!padded) return null
  const length = new DataView(padded.buffer, padded.byteOffset, padded.byteLength).getUint32(0)
  try { return JSON.parse(new TextDecoder().decode(padded.subarray(4, 4 + length))).text ?? null } catch { return null }
}

let cursor
let count = 0
do {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'arkiv_query', params: [query, { limit: '0xc8', select: { key: true, creator: true, payload: true }, ...(cursor ? { cursor } : {}) }] }),
  })
  const { result, error } = await res.json()
  if (error) throw new Error(`arkiv_query failed: ${JSON.stringify(error)}`)
  for (const row of result.data) {
    count++
    const text = open(Uint8Array.from(Buffer.from(row.payload.slice(2), 'hex')))
    console.log(`${row.key}  $creator ${row.creator}\n    ${text === null ? '(sealed: no key given, or not sealed for this key)' : JSON.stringify(text)}`)
  }
  cursor = result.cursor
} while (cursor)
console.log(`${count} tip(s) for inbox ${INBOX}`)
