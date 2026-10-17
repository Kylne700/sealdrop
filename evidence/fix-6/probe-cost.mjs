// Which JSON-RPC methods carry an Arkiv-Cost on the public RPC? Prints status and the cost header only.
const URL_ = 'https://rpc.tiramisu.db-chain.testnet.arkiv.network'
const calls = [
  ['eth_blockNumber', []],
  ['eth_getTransactionByHash', ['0x' + '00'.repeat(31) + '01']],
  ['arkiv_getBlockTiming', []],
  ['eth_chainId', []],
  ['eth_getBalance', ['0xa05d5Bd99440d95526120062364518ddfe11797F', 'latest']],
]
for (const [method, params] of calls) {
  try {
    const r = await fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
    const body = await r.text()
    console.log(`${method}: HTTP ${r.status} arkiv-cost=${r.headers.get('arkiv-cost')} body=${body.slice(0, 90).replace(/\s+/g, ' ')}`)
  } catch (e) { console.log(`${method}: ERROR ${e.message}`) }
}
