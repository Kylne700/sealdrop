import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { createReader, localSigner, sendTip } from '/path/to/sealdrop/src/arkiv'
import { newBoxKeyPair, sealText } from '/path/to/sealdrop/src/crypto'
const reader = createReader()
const empty = localSigner(generatePrivateKey())
const other = privateKeyToAccount(generatePrivateKey()).address
const box = newBoxKeyPair()
try { await sendTip(reader, empty, { key: '0x' + '11'.repeat(32), owner: other } as never, sealText('SYNTHETIC TEST TIP unfunded', box.publicKey), 14) } catch (e) {
  let i = 0
  for (let c: any = e; c && i < 10; c = c.cause, i++) {
    const keys = Object.keys(c).filter((k) => !['cause', 'stack'].includes(k))
    console.log(`#${i} ${c.name}: ${String(c.shortMessage ?? c.message).split('\n')[0].slice(0, 120)} | keys: ${keys.join(',')} | details=${JSON.stringify(c.details)?.slice(0, 160)} code=${c.code} data=${JSON.stringify(c.data)?.slice(0, 120)} meta=${JSON.stringify(c.metaMessages)?.slice(0, 200)}`)
  }
}
