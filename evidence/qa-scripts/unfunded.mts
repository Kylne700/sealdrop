// What does the node really answer when a key with 0 GLM tries to write? Does isOutOfFunds() match it? (No private key is printed.)
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { createReader, localSigner, createInbox, fundAccount, sendTip, explainError, isOutOfFunds, budget, balanceOf } from '/path/to/sealdrop/src/arkiv'
import { newBoxKeyPair, sealText } from '/path/to/sealdrop/src/crypto'
import { newInboxId } from '/path/to/sealdrop/src/codec'

const reader = createReader()
const empty = localSigner(generatePrivateKey())
const other = privateKeyToAccount(generatePrivateKey()).address
console.log('fresh key balance (wei):', String(await balanceOf(reader, empty.address)))
const box = newBoxKeyPair()
const attempts: [string, () => Promise<unknown>][] = [
  ['plain transfer (what ensureFunds does)', () => fundAccount(empty, other, '0.005')],
  ['createInbox', () => createInbox(empty, { inboxId: newInboxId(), name: 'Synthetic', description: 'Synthetic test', publicKey: box.publicKey })],
  ['sendTip', () => sendTip(reader, empty, { key: '0x' + '11'.repeat(32), owner: other } as never, sealText('SYNTHETIC TEST TIP unfunded', box.publicKey), 14)],
]
for (const [name, fn] of attempts) {
  try { await fn(); console.log(`${name}: UNEXPECTEDLY SUCCEEDED`) } catch (e) {
    const err = e as Error & { shortMessage?: string; details?: string; cause?: { message?: string } }
    const chain: string[] = []
    for (let c: any = err; c && chain.length < 6; c = c.cause) chain.push(String(c.shortMessage ?? c.message).split('\n')[0].slice(0, 160))
    console.log(`${name}:\n  chain: ${chain.join('  <-  ')}\n  details: ${String(err.details ?? '').slice(0, 200)}\n  isOutOfFunds: ${isOutOfFunds(e)}\n  explainError: ${explainError(e)}`)
  }
}
console.log('arkiv_query budget used by this script:', JSON.stringify(budget))
