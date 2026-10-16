// Fills .env.local (chmod 600) with fresh TESTNET-ONLY keys, only for variables that are missing.
// Never prints a private key or secret: addresses and public keys only.
import { existsSync, readFileSync, appendFileSync, writeFileSync, chmodSync } from 'node:fs'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import nacl from 'tweetnacl'

const file = new URL('../.env.local', import.meta.url)
const have = new Set(existsSync(file) ? readFileSync(file, 'utf8').split('\n').map((l) => l.split('=')[0]) : [])
const b64 = (u8) => Buffer.from(u8).toString('base64')

const roles = [
  ['FUNDER_PRIVATE_KEY', 'funder: claims the faucet once, funds the other wallets', 'evm'],
  ['VITE_DEMO_SENDER_PRIVATE_KEY', 'demo sender: shared testnet key shipped in the build (demo mode)', 'evm'],
  ['DEMO_DESK_PRIVATE_KEY', 'demo desk newsroom: owns the flagship inbox, NOT in the build', 'evm'],
  ['DEMO_DESK_BOX_SECRET', 'demo desk X25519 secret (base64): decrypts Demo Desk tips, NOT in the build', 'box'],
]
if (!existsSync(file)) {
  writeFileSync(file, '# Testnet-only keys (Arkiv Tiramisu 7738577). Never commit. Only VITE_* vars reach the browser bundle.\n', { mode: 0o600 })
}
for (const [name, note, kind] of roles) {
  if (have.has(name)) { console.log(`${name.padEnd(30)} already set, left alone`); continue }
  if (kind === 'evm') {
    const pk = generatePrivateKey()
    appendFileSync(file, `# ${note}\n${name}=${pk}\n`)
    console.log(`${name.padEnd(30)} address    ${privateKeyToAccount(pk).address}`)
  } else {
    const secret = nacl.randomBytes(32)
    appendFileSync(file, `# ${note}\n${name}=${b64(secret)}\n`)
    console.log(`${name.padEnd(30)} public key ${b64(nacl.box.keyPair.fromSecretKey(secret).publicKey)}`)
  }
}
chmodSync(file, 0o600)
