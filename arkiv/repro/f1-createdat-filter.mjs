// Friction F1: the SDK query builder refuses `$createdAt` filters, the node accepts them.
// Read-only, no key needed.  node arkiv/repro/f1-createdat-filter.mjs
import { http } from 'viem'
import { createPublicClient } from '@arkiv-network/sdk'
import { u64 } from '@arkiv-network/sdk/attr'
import { gte } from '@arkiv-network/sdk/query'
import { tiramisu } from '@arkiv-network/sdk/chains'

const client = createPublicClient({ chain: tiramisu, transport: http() })
const since = (await client.getBlockNumber()) - 100n

try {
  await client.select({ key: true }).where(gte('$createdAt', u64(since))).fetch()
  console.log('builder: accepted')
} catch (e) {
  console.log('builder :', e.name, '-', e.message.split('\n')[0])
}

const page = await client.query(`$createdAt >= u64(${since})`, { select: { key: true, createdAt: true }, limit: 5 })
console.log('raw query string via client.query():', page.entities.length, 'entities, first createdAt =', String(page.entities[0]?.createdAt))
