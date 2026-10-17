// Public count of the tips a creator has sent to A-wallet's throwaway inbox. Usage: tsx count.mts <label> <creator>
import { createReader, findInbox, sweepTips } from '../src/arkiv'
const reader = createReader()
const [label, creator] = process.argv.slice(2) as [string, `0x${string}`]
const { inbox } = await findInbox(reader, { creator: '0x5116fB80527C12b04e3281594971Abf51276cb22', inboxId: 'inbox-jwejqk' })
if (!inbox) throw new Error('inbox not found')
const { tips } = await sweepTips(reader, inbox.key)
const mine = tips.filter((t) => t.creator.toLowerCase() === creator.toLowerCase()).sort((a, b) => Number(b.createdAt - a.createdAt))
console.log(JSON.stringify({ label, at: new Date().toISOString(), inbox: inbox.key, tipsFromCreator: mine.length, newest: mine.slice(0, 3).map((t) => ({ key: t.key, createdAt: t.createdAt.toString(), bytes: t.sealed.length })) }))
