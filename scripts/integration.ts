// Integration test against the live Arkiv Tiramisu testnet. It imports the same src/arkiv.ts the browser
// app runs, with a throwaway newsroom and the shared demo-sender key. Output is saved to
// evidence/integration.txt. Run it on its own (the smoke test uses the same demo key).
//   npm run integration
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { formatEther, type Hex } from 'viem'
import { generatePrivateKey } from 'viem/accounts'
import { CHAIN_ID, FUND_AMOUNT_GLM, RPC_HTTP, addressUrl, entityUrl, txUrl } from '../src/config'
import { blockToUnix, formatUtc, inboxPublicKey, newInboxId } from '../src/codec'
import { newBoxKeyPair, openText, sealText } from '../src/crypto'
import {
  balanceOf, budget, burnTip, createInbox, createReader, findInbox, fundAccount, getTip, getTiming, inboxesDueForRenewal,
  listInboxes, localSigner, pinTip, renewInbox, retryHook, sendTip, sweepTips, tipsSince, watchHandovers,
} from '../src/arkiv'
import { needKey } from './load-env'

const lines: string[] = []
const log = (s = '') => { console.log(s); lines.push(s) }
let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) passed++; else failed++
  log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `   ${detail}` : ''}`)
}
const start = Date.now()
const step = (title: string) => log(`\n== ${title}   [+${((Date.now() - start) / 1000).toFixed(1)}s]`)
const glm = (wei: bigint) => `${formatEther(wei)} GLM`
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const reader = createReader()
  const demo = localSigner(needKey('VITE_DEMO_SENDER_PRIVATE_KEY'))
  const newsroom = localSigner(generatePrivateKey())
  const box = newBoxKeyPair()
  const inboxId = newInboxId()
  const sdkVersion = (JSON.parse(readFileSync('node_modules/@arkiv-network/sdk/package.json', 'utf8')) as { version: string }).version
  let commit = 'unknown'
  try { commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim() } catch { /* not a git checkout */ }

  log('Sealdrop integration test (all text sent is synthetic test data)')
  log(`date          ${new Date().toISOString()}`)
  log(`chain         Arkiv Tiramisu, chain id ${CHAIN_ID}, RPC ${RPC_HTTP}`)
  log(`sdk           @arkiv-network/sdk ${sdkVersion}, node ${process.version}, repo commit ${commit}`)
  log(`demo sender   ${demo.address}   ${addressUrl(demo.address)}`)
  log(`newsroom      ${newsroom.address} (throwaway, key generated in this run and never printed)`)
  log(`inbox id      ${inboxId}`)

  step('1. fund the throwaway newsroom from the demo sender (plain GLM transfer)')
  const senderBefore = await balanceOf(reader, demo.address)
  log(`  demo sender balance before: ${glm(senderBefore)}`)
  const fundTx = await fundAccount(demo, newsroom.address, FUND_AMOUNT_GLM)
  log(`  tx ${fundTx}\n  ${txUrl(fundTx)}`)
  check('newsroom received the funds', (await balanceOf(reader, newsroom.address)) === BigInt(Math.round(Number(FUND_AMOUNT_GLM) * 1e18)), `balance ${glm(await balanceOf(reader, newsroom.address))}`)

  step('2. create the inbox (Entity Expiration 7 days)')
  const created = await createInbox(newsroom, { inboxId, name: 'Synthetic test newsroom', description: 'Created by the Sealdrop integration test. No real person or information.', publicKey: box.publicKey })
  log(`  entity ${created.entityKey}\n  tx ${created.txHash}\n  ${txUrl(created.txHash)}\n  ${entityUrl(created.entityKey)}`)
  const timing = await getTiming(reader)
  log(`  expires at block ${created.expiresAt} = ${formatUtc(blockToUnix(created.expiresAt, timing))}`)

  step('3. a sender resolves the inbox by its on-chain creator')
  const found = await findInbox(reader, { creator: newsroom.address, inboxId })
  log(`  query: ${found.query}`)
  check('inbox found by $creator + inbox_id', found.inbox?.key === created.entityKey)
  check('exactly one match', found.matches === 1)
  check('$creator and $owner are the newsroom', found.inbox?.creator === newsroom.address && found.inbox?.owner === newsroom.address)
  check('published public key matches', found.inbox !== null && Buffer.from(inboxPublicKey(found.inbox.payload)).equals(Buffer.from(box.publicKey)))
  const impostor = await findInbox(reader, { creator: demo.address, inboxId })
  check('the same inbox id under another creator resolves to nothing', impostor.inbox === null, `(${impostor.query})`)
  const inbox = found.inbox!
  const mine = await listInboxes(reader, newsroom.address)
  check('listInboxes(creator) returns it', mine.inboxes.length === 1)

  step('4. live path: WebSocket subscription, then a sealed tip with atomic hand-over')
  const seen = new Map<Hex, number>()
  const waiters = new Map<Hex, () => void>()
  const unwatch = watchHandovers(reader, newsroom.address, {
    onHandover: (key) => { seen.set(key, Date.now()); waiters.get(key)?.() },
    onError: (e) => log(`  websocket error: ${e.message}`),
  })
  await sleep(3000)
  const waitHandover = (key: Hex, ms: number) => new Promise<boolean>((resolve) => {
    if (seen.has(key)) return resolve(true)
    const timer = setTimeout(() => resolve(false), ms)
    waiters.set(key, () => { clearTimeout(timer); resolve(true) })
  })
  const blockBefore = (await getTiming(reader)).head
  const retries: string[] = []
  retryHook.onRetry = (attempt, message) => retries.push(`attempt ${attempt}: ${message}`)

  const text1 = 'SYNTHETIC TEST TIP 1: nobody and nothing real is described here.'
  const sent1 = await sendTip(reader, demo, inbox, sealText(text1, box.publicKey), 14)
  const receiptAt = Date.now()
  log(`  tip 1 entity ${sent1.entityKey}\n  tx ${sent1.txHash}\n  ${txUrl(sent1.txHash)}\n  ${entityUrl(sent1.entityKey)}`)
  const live = await waitHandover(sent1.entityKey, 30000)
  const lag = live ? (seen.get(sent1.entityKey)! - receiptAt) / 1000 : 0
  check('ownership event for the newsroom arrived over the WebSocket', live, live ? `${Math.abs(lag).toFixed(2)} s ${lag < 0 ? 'before' : 'after'} sendTip returned` : 'timed out after 30 s')
  const tip1 = await getTip(reader, sent1.entityKey, [inbox.key])
  check('getTip reads it back as a tip for this inbox', tip1 !== null)
  check('$creator is the sender, $owner is the newsroom', tip1?.creator === demo.address && tip1?.owner === newsroom.address, `creator ${tip1?.creator} owner ${tip1?.owner}`)
  check('the newsroom decrypts it', tip1 !== null && openText(tip1.sealed, box) === text1)
  check('a stranger key cannot decrypt it', tip1 !== null && openText(tip1.sealed, newBoxKeyPair()) === null)
  const full = (await reader.http.getEntity(sent1.entityKey)) as { creationFlags?: { readonly?: boolean }; attributes?: Record<string, { value: unknown }> }
  check('created readonly', full.creationFlags?.readonly === true)
  check('only three attributes are public: type, app, inbox', Object.keys(full.attributes ?? {}).sort().join(',') === 'app,inbox,type', Object.keys(full.attributes ?? {}).join(','))
  check('ciphertext is padded to a size bucket', tip1 !== null && [1024, 4096, 16384, 65536].includes(tip1.sealed.length - 73), `${tip1?.sealed.length} bytes on chain`)
  let senderCanDelete = true
  try { await burnTip(demo, sent1.entityKey) } catch (e) { senderCanDelete = false; log(`  sender delete rejected: ${(e as Error).message.split('\n')[0]?.slice(0, 200)}`) }
  check('after hand-over the sender can no longer delete the tip', !senderCanDelete)

  step('5. two concurrent sends with the shared demo key (nonce collision handling)')
  const [a, b] = await Promise.all([
    sendTip(reader, demo, inbox, sealText('SYNTHETIC TEST TIP 2: concurrent send A.', box.publicKey), 7),
    sendTip(reader, demo, inbox, sealText('SYNTHETIC TEST TIP 3: concurrent send B.', box.publicKey), 1),
  ])
  log(`  tip 2 ${a.entityKey}  tx ${a.txHash}\n  tip 3 ${b.entityKey}  tx ${b.txHash}`)
  log(`  retries needed: ${retries.length === 0 ? 'none' : retries.join(' | ')}`)
  check('both concurrent sends landed', a.entityKey !== b.entityKey && (await getTip(reader, a.entityKey, [inbox.key])) !== null && (await getTip(reader, b.entityKey, [inbox.key])) !== null)

  step('6. queries: cursor pagination and the $createdAt incremental query')
  const swept = await sweepTips(reader, inbox.key, { pageSize: 2 })
  log(`  query: ${swept.query}`)
  check('sweep with page size 2 follows the cursor over 2 pages and finds 3 tips', swept.tips.length === 3 && swept.pages === 2, `${swept.tips.length} tips, ${swept.pages} pages`)
  const texts = swept.tips.map((t) => openText(t.sealed, box)).sort()
  check('all three decrypt', texts.every((t) => t !== null && t.startsWith('SYNTHETIC TEST TIP')))
  const since = await tipsSince(reader, inbox.key, blockBefore)
  log(`  query: ${since.query}`)
  check('tips since the block before the first send: 3', since.tips.length === 3, `${since.tips.length}`)
  const later = await tipsSince(reader, inbox.key, (await getTiming(reader)).head + 5n)
  check('tips since a future block: 0', later.tips.length === 0)

  step('7. Lifetime Extension of the inbox (lease renewed by activity)')
  const now = await getTiming(reader)
  const due0 = await inboxesDueForRenewal(reader, newsroom.address, now)
  log(`  query: ${due0.query}`)
  check('a fresh inbox (7 days left) is not due when the threshold is 6 days', due0.inboxes.length === 0)
  const due8 = await inboxesDueForRenewal(reader, newsroom.address, now, 8)
  check('with a threshold of 8 days the range query on $expiresAt returns it', due8.inboxes.length === 1)
  const renewed = await renewInbox(newsroom, inbox.key)
  log(`  renew tx ${renewed.txHash}\n  ${txUrl(renewed.txHash)}`)
  check('expiry moved later', renewed.expiresAt > inbox.expiresAt, `${inbox.expiresAt} -> ${renewed.expiresAt}`)

  step('8. the newsroom keeps one tip longer and burns another (owner-only actions)')
  const pinned = await pinTip(newsroom, sent1.entityKey, 30)
  log(`  pin tx ${pinned.txHash}\n  ${txUrl(pinned.txHash)}`)
  check('tip 1 expiry extended to 30 days', tip1 !== null && pinned.expiresAt > tip1.expiresAt, `${tip1?.expiresAt} -> ${pinned.expiresAt}`)
  const burned = await burnTip(newsroom, a.entityKey)
  log(`  burn tx ${burned.txHash}\n  ${txUrl(burned.txHash)}`)
  check('burned tip is gone', (await getTip(reader, a.entityKey, [inbox.key], 1)) === null)
  const owned = await sweepTips(reader, inbox.key, { owner: newsroom.address })
  log(`  query (newsroom view, ownedBy): ${owned.query}`)
  check('sweep for tips owned by the newsroom returns 2 tips', owned.tips.length === 2, `${owned.tips.length}`)
  check('sweep for tips owned by the sender returns none (everything was handed over)', (await sweepTips(reader, inbox.key, { owner: demo.address })).tips.length === 0)

  step('9. read without Sealdrop: raw JSON-RPC arkiv_query, no SDK and no app backend')
  const res = await fetch(RPC_HTTP, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'arkiv_query', params: [swept.query, { limit: '0xc8', select: { key: true, owner: true, creator: true, payload: true } }] }),
  })
  const body = (await res.json()) as { result?: { data: { key: Hex; owner: Hex; creator: Hex; payload: Hex }[] }; error?: unknown }
  const rows = body.result?.data ?? []
  log(`  POST ${RPC_HTTP}  arkiv_query  ->  ${rows.length} entities`)
  check('raw query returns the 2 remaining tips', rows.length === 2, JSON.stringify(body.error ?? ''))
  const decoded = rows.map((r) => openText(Uint8Array.from(Buffer.from(r.payload.slice(2), 'hex')), box))
  check('and the payloads decrypt with the newsroom key', decoded.length === 2 && decoded.every((t) => t !== null))

  unwatch()

  step('summary')
  const senderAfter = await balanceOf(reader, demo.address)
  log(`  demo sender spent ${glm(senderBefore - senderAfter)} (incl. ${FUND_AMOUNT_GLM} GLM given to the throwaway newsroom)`)
  log(`  newsroom left     ${glm(await balanceOf(reader, newsroom.address))}`)
  log(`  public RPC query budget used by this run: ${budget.spent} cost units over ${budget.queries} costed queries (${budget.remaining} of ${budget.limit} left in the window)`)
  log(`  retries over the whole run: ${retries.length === 0 ? 'none' : retries.length}`)
  log(`  checks: ${passed} passed, ${failed} failed, ${((Date.now() - start) / 1000).toFixed(1)} s`)
  log('  Entities above expire on their own (inbox 7 days, tips 1 to 30 days); the transaction links stay valid after that.')
}

main()
  .catch((e) => { failed++; log(`\nFAILED: ${(e as Error).stack ?? e}`) })
  .finally(() => {
    mkdirSync('evidence', { recursive: true })
    writeFileSync('evidence/integration.txt', lines.join('\n') + '\n')
    process.exit(failed === 0 ? 0 : 1)
  })
