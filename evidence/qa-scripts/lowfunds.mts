// Same writes from a key with a tiny but non-zero balance (a half-drained demo key). Funds come from the demo key; nothing secret is printed.
import { generatePrivateKey } from 'viem/accounts'
import { parseEther, formatEther } from 'viem'
import { createReader, localSigner, createInbox, sendTip, explainError, isOutOfFunds, balanceOf, fundAccount, budget } from '/path/to/sealdrop/src/arkiv'
import { newBoxKeyPair, sealText } from '/path/to/sealdrop/src/crypto'
import { newInboxId } from '/path/to/sealdrop/src/codec'
import { needKey } from '/path/to/sealdrop/scripts/load-env'
const reader = createReader()
const demo = localSigner(needKey('VITE_DEMO_SENDER_PRIVATE_KEY'))
const box = newBoxKeyPair()
const before = await balanceOf(reader, demo.address)
for (const amount of ['0.000000001', '0.000001', '0.00002']) {
  const low = localSigner(generatePrivateKey())
  await fundAccount(demo, low.address, amount)
  console.log(`\n== key funded with ${amount} GLM, balance now ${formatEther(await balanceOf(reader, low.address))}`)
  for (const [name, fn] of [
    ['createInbox', () => createInbox(low, { inboxId: newInboxId(), name: 'Synthetic', description: 'Synthetic test', publicKey: box.publicKey })],
    ['sendTip', () => sendTip(reader, low, { key: '0x' + '11'.repeat(32), owner: low.address } as never, sealText('SYNTHETIC TEST TIP low funds', box.publicKey), 14)],
  ] as [string, () => Promise<unknown>][]) {
    try { await fn(); console.log(`${name}: succeeded, balance left ${formatEther(await balanceOf(reader, low.address))}`) } catch (e) {
      let deepest: any = e; while (deepest.cause) deepest = deepest.cause
      console.log(`${name}: deepest="${String(deepest.details ?? deepest.message).slice(0, 140)}" isOutOfFunds=${isOutOfFunds(e)} -> ${explainError(e).slice(0, 90)}`)
    }
  }
}
console.log(`\ndemo sender spent ${formatEther(before - (await balanceOf(reader, demo.address)))} GLM in this probe; arkiv_query budget used: ${JSON.stringify(budget)}`)
