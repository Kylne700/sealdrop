// Build-time settings. Only VITE_* variables reach the browser bundle.
import type { Hex } from 'viem'
import { DEMO_DESK } from './config'

const rawKey = import.meta.env.VITE_DEMO_SENDER_PRIVATE_KEY as string | undefined

/** The shared testnet-only sender. Absent when the site was built without .env.local; the app then asks for a wallet. */
export const DEMO_SENDER_KEY: Hex | undefined = /^0x[0-9a-fA-F]{64}$/.test(rawKey ?? '') ? (rawKey as Hex) : undefined

export const DESK_ADDRESS = (import.meta.env.VITE_DEMO_DESK_ADDRESS as string | undefined) || DEMO_DESK.address
