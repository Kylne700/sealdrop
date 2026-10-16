// Constants shared by the browser app and the Node scripts. No environment access in here, so the
// same module runs under Vite, vitest and tsx.

/** Value of the `app` attribute on every Sealdrop entity. Bump the suffix when the schema changes. */
export const APP = 'sealdrop-v1'

export const CHAIN_ID = 7738577
export const RPC_HTTP = 'https://rpc.tiramisu.db-chain.testnet.arkiv.network'
export const RPC_WS = 'wss://rpc.tiramisu.db-chain.testnet.arkiv.network'

export const BLOCK_SECONDS = 2
export const BLOCKS_PER_DAY = (24 * 60 * 60) / BLOCK_SECONDS

/** Entity Expiration of an inbox. Lifetime Extension renews it whenever the newsroom is active. */
export const INBOX_LIFETIME_DAYS = 7
/** The console renews an inbox when less than this remains (so opening it daily keeps it alive). */
export const RENEW_BELOW_DAYS = 6

/** Entity Expiration of a tip is chosen by the source. */
export const TIP_LIFETIME_CHOICES = [1, 7, 14, 30] as const
export const DEFAULT_TIP_DAYS = 14
/** A newsroom that wants to keep a tip longer extends it by this much. */
export const PIN_DAYS = 30

export const PAGE_SIZE = 200
/** Cost units the public RPC lets an anonymous client spend per window. Read off a 429 response, not documented (friction F7). */
export const ANON_BUDGET_UNITS = 10_000
/** What a throwaway newsroom is given by the shared demo key (about 40 writes). */
export const FUND_AMOUNT_GLM = '0.005'

export const EXPLORER = 'https://tiramisu.explorer.arkiv.network'
export const DATA_EXPLORER = 'https://data.arkiv.network'
export const FAUCET_URL = 'https://hub.arkiv.network/faucet'

/** The flagship inbox. Its newsroom key is not part of this repository or the build. */
export const DEMO_DESK = {
  address: '0x6a3C43407F58B11E871310cE296eb3bF1a3fdcF6',
  inboxId: 'demo-desk',
} as const

/** Public address of the shared demo sender (its key ships in the build on purpose, see README). */
export const DEMO_SENDER_ADDRESS = '0xa05d5Bd99440d95526120062364518ddfe11797F'

/** Where the source lives; change when the repository is published under another name. */
export const REPO_URL = 'https://github.com/Kylne700/sealdrop'

export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`
export const addressUrl = (address: string) => `${EXPLORER}/address/${address}`
export const entityUrl = (key: string) => `${DATA_EXPLORER}/entity/${key}`
export const ownerUrl = (address: string) => `${DATA_EXPLORER}/owner/${address}`
