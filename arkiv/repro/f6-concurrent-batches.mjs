// Friction F6: two create+hand-over batches built with predictEntityKeys() from the same account at the same time.
// Needs a funded Tiramisu key:  PRIVATE_KEY=0x... node arkiv/repro/f6-concurrent-batches.mjs
import { http } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { createPublicClient, createWalletClient, ExpirationTime } from '@arkiv-network/sdk'
import { tiramisu } from '@arkiv-network/sdk/chains'

const account = privateKeyToAccount(process.env.PRIVATE_KEY)
const pub = createPublicClient({ chain: tiramisu, transport: http() })
const wallet = createWalletClient({ chain: tiramisu, transport: http(), account })
const recipient = privateKeyToAccount(generatePrivateKey()).address // the hand-over target; needs no funds

async function send(label) {
  try {
    const [p] = await pub.predictEntityKeys({ owner: account.address, count: 1 })
    const r = await wallet.executeBatch({
      creates: [{ payload: new Uint8Array([1]), contentType: 'application/octet-stream', attributes: { type: 'f6' }, expires: ExpirationTime.fromHours(1), salt: p.salt }],
      ownershipChanges: [{ entityKey: p.key, newOwner: recipient }],
    })
    console.log(label, 'OK    ', r.txHash, 'entity', r.createdEntities[0], '(predicted', p.key + ')')
  } catch (e) {
    console.log(label, 'FAILED', e.name, '| txHash:', e.txHash ?? '(none)')
    console.log('        message:', e.message.split('\n').slice(0, 2).join(' / ').slice(0, 260))
    console.log('        cause  :', (e.cause?.shortMessage ?? e.cause?.message ?? '(none)').split('\n')[0].slice(0, 200))
  }
}
await Promise.all([send('A'), send('B')])
