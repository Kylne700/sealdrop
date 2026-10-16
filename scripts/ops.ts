// Operator tasks for the Demo Desk and the shared demo wallets. Keys come from .env.local and are never printed.
//   npm run ops -- balances
//   npm run ops -- fund <sender|desk> <amountGlm>      (from FUNDER_PRIVATE_KEY, plain GLM transfer)
//   npm run ops -- desk-create | desk-renew | desk-read
import { formatEther, type Address } from 'viem'
import { boxKeyPairFromSecret, fromB64, openText } from '../src/crypto'
import { DEMO_DESK, entityUrl, txUrl } from '../src/config'
import { balanceOf, createInbox, createReader, explainError, findInbox, fundAccount, getTiming, localSigner, renewInbox, sweepTips } from '../src/arkiv'
import { blockToUnix, formatUtc } from '../src/codec'
import { need, needKey } from './load-env'

const reader = createReader()
const desk = () => {
  const signer = localSigner(needKey('DEMO_DESK_PRIVATE_KEY'))
  if (signer.address.toLowerCase() !== DEMO_DESK.address.toLowerCase()) throw new Error(`DEMO_DESK_PRIVATE_KEY belongs to ${signer.address}, but config.ts says the desk is ${DEMO_DESK.address}`)
  return signer
}
const deskBox = () => boxKeyPairFromSecret(fromB64(need('DEMO_DESK_BOX_SECRET')))
const glm = (wei: bigint) => `${Number(formatEther(wei)).toFixed(5)} GLM`

async function lookup() {
  const { inbox } = await findInbox(reader, { creator: DEMO_DESK.address, inboxId: DEMO_DESK.inboxId })
  if (!inbox) throw new Error('The Demo Desk inbox does not exist (it may have expired). Run: npm run ops -- desk-create')
  return inbox
}

const commands: Record<string, () => Promise<void>> = {
  async balances() {
    const rows: [string, Address][] = [
      ['funder', localSigner(needKey('FUNDER_PRIVATE_KEY')).address],
      ['demo-sender', localSigner(needKey('VITE_DEMO_SENDER_PRIVATE_KEY')).address],
      ['demo-desk', DEMO_DESK.address],
    ]
    for (const [role, address] of rows) console.log(role.padEnd(12), address, glm(await balanceOf(reader, address)))
  },

  async fund() {
    const [, , target, amount] = process.argv
    if ((target !== 'sender' && target !== 'desk') || !amount) throw new Error('usage: fund <sender|desk> <amountGlm>')
    const to = target === 'desk' ? DEMO_DESK.address : localSigner(needKey('VITE_DEMO_SENDER_PRIVATE_KEY')).address
    const hash = await fundAccount(localSigner(needKey('FUNDER_PRIVATE_KEY')), to, amount)
    console.log(`sent ${amount} GLM to ${to}\n${txUrl(hash)}`)
  },

  async 'desk-create'() {
    const signer = desk()
    const existing = await findInbox(reader, { creator: signer.address, inboxId: DEMO_DESK.inboxId })
    if (existing.inbox) throw new Error(`The Demo Desk inbox already exists: ${existing.inbox.key}. Use desk-renew to keep it alive.`)
    const r = await createInbox(signer, {
      inboxId: DEMO_DESK.inboxId,
      name: 'Sealdrop Demo Desk (synthetic test inbox)',
      description: 'Flagship demo inbox for the Arkiv Global Tour Stop. Send only made-up test messages: the builder holds this inbox\'s key and reads what arrives. Everything sent here expires on its own.',
      publicKey: deskBox().publicKey,
    })
    console.log(`created Demo Desk inbox ${r.entityKey}\n${txUrl(r.txHash)}\n${entityUrl(r.entityKey)}`)
  },

  async 'desk-renew'() {
    const inbox = await lookup()
    const r = await renewInbox(desk(), inbox.key)
    console.log(`renewed ${r.entityKey}, now expires at block ${r.expiresAt}\n${txUrl(r.txHash)}`)
  },

  async 'desk-read'() {
    const inbox = await lookup()
    const timing = await getTiming(reader)
    const { tips, pages } = await sweepTips(reader, inbox.key)
    console.log(`Demo Desk ${inbox.key}: ${tips.length} tip(s) over ${pages} page(s); inbox expires ${formatUtc(blockToUnix(inbox.expiresAt, timing))}`)
    for (const t of tips) {
      const text = openText(t.sealed, deskBox())
      console.log(`${formatUtc(blockToUnix(t.createdAt, timing))}  ${t.key}  ${t.sealed.length} B  from ${t.creator}  ${text === null ? '(undecryptable)' : JSON.stringify(text.slice(0, 120))}`)
    }
  },
}

const name = process.argv[2] ?? ''
const run = commands[name]
if (!run) {
  console.error(`usage: npm run ops -- <${Object.keys(commands).join('|')}>`)
  process.exit(2)
}
run().then(
  () => process.exit(0),
  (e) => {
    console.error(`ops ${name} failed: ${explainError(e)}`)
    process.exit(1)
  },
)
