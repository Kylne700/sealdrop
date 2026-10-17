// Public chain state of one address: nonce (latest, pending) and balance. Usage: tsx chain.mts <address>
import { createPublicClient, http, formatEther } from 'viem'
import { RPC_HTTP } from '../src/config'
const c = createPublicClient({ transport: http(RPC_HTTP) })
const address = process.argv[2] as `0x${string}`
const [latest, pending, bal, block] = await Promise.all([c.getTransactionCount({ address, blockTag: 'latest' }), c.getTransactionCount({ address, blockTag: 'pending' }), c.getBalance({ address }), c.getBlockNumber()])
console.log(JSON.stringify({ at: new Date().toISOString(), address, block: block.toString(), nonceLatest: latest, noncePending: pending, balanceGlm: formatEther(bal) }))
