// Loads .env.local for the Node scripts. Never prints a value.
import { existsSync } from 'node:fs'
import type { Hex } from 'viem'

const file = new URL('../.env.local', import.meta.url)
if (existsSync(file)) process.loadEnvFile(file)

export function need(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is missing. Run \`npm run keys\` to create .env.local, then fund the wallets (see README).`)
  return value
}

export const needKey = (name: string) => need(name) as Hex
