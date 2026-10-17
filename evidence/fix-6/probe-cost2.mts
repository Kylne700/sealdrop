// Same RPC, through the app's own transport: what does budget count for one arkiv_query, one getBlockTiming and one eth_blockNumber?
import { budget, createReader, findInbox, getTiming } from '../../src/arkiv.ts'
import { DEMO_DESK } from '../../src/config.ts'
const r = createReader()
const b = () => `spent=${budget.spent} queries=${budget.queries}`
await getTiming(r); console.log('after arkiv_getBlockTiming:', b())
await r.http.getBlockNumber({ cacheTime: 0 }); console.log('after eth_blockNumber:', b())
await findInbox(r, { creator: DEMO_DESK.address, inboxId: DEMO_DESK.inboxId }); console.log('after one arkiv_query (findInbox):', b())
