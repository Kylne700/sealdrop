// Friction F8: an Arkiv entity write from an account with 0 GLM fails with "out of gas", a plain transfer with "insufficient funds".
// Needs no funded key: it makes a throwaway one, nothing is mined, nothing secret is printed. No arkiv_query, so no anonymous budget is used.
//   node arkiv/repro/f8-unfunded-write.mjs
import { http } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { createWalletClient, ExpirationTime } from '@arkiv-network/sdk'
import { tiramisu } from '@arkiv-network/sdk/chains'

const wallet = createWalletClient({ chain: tiramisu, transport: http(), account: privateKeyToAccount(generatePrivateKey()) })
const attempts = {
  'plain transfer': () => wallet.sendTransaction({ to: '0x000000000000000000000000000000000000dEaD', value: 1n }),
  'createEntity  ': () => wallet.createEntity({
    payload: new Uint8Array([1]), contentType: 'application/octet-stream', attributes: { a: 1 }, expires: ExpirationTime.fromHours(1),
  }),
}
for (const [name, run] of Object.entries(attempts)) {
  try { await run(); console.log(name, 'UNEXPECTEDLY SUCCEEDED') } catch (e) {
    console.log(name)
    for (let c = e, depth = 0; c && depth < 5; c = c.cause, depth++) {
      console.log(`  #${depth} ${c.name}: ${String(c.shortMessage ?? c.message).split('\n')[0]}`)
      if (c.details) console.log(`      details: ${c.details}${c.code ? `  (code ${c.code})` : ''}`)
    }
  }
}
