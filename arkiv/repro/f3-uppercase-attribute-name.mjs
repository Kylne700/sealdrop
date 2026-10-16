// Friction F3: the SDK validator allows uppercase attribute names, the engine rejects them.
// Needs a funded Tiramisu key:  PRIVATE_KEY=0x... node arkiv/repro/f3-uppercase-attribute-name.mjs
import { http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { createWalletClient, ExpirationTime } from '@arkiv-network/sdk'
import { tiramisu } from '@arkiv-network/sdk/chains'

const wallet = createWalletClient({ chain: tiramisu, transport: http(), account: privateKeyToAccount(process.env.PRIVATE_KEY) })
for (const name of ['sent_at', 'sentAt']) {
  try {
    const r = await wallet.createEntity({
      payload: new Uint8Array([1]), contentType: 'application/octet-stream',
      attributes: { [name]: 1 }, expires: ExpirationTime.fromHours(1),
    })
    console.log(name.padEnd(8), 'OK     tx', r.txHash)
  } catch (e) {
    console.log(name.padEnd(8), 'FAILED', e.name, 'txHash:', e.txHash ?? '(none, rejected before broadcast)')
    console.log('        ', e.message.split('\n')[0])
  }
}
