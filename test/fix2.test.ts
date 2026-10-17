// Fix stage 2: A-W2 label, A-W4 export warning, A-W5 wallet status, N1 HTTP 5xx advice, T1 noscript.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { explainError, notifyOnSend } from '../src/arkiv'

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')

describe('fix stage 2', () => {
  it('A-W2: extendEntity sets the expiry to now + N days, so the label must not say "more days"', () => {
    expect(read('../src/pages/newsroom.ts')).not.toMatch(/more days/)
    expect(read('../src/pages/newsroom.ts')).toMatch(/Keep until \$\{PIN_DAYS\} days from now/)
  })
  it('A-W4: the console warns next to Export key file', () => {
    expect(read('../src/pages/newsroom.ts')).toMatch(/Export the key file: if you clear the browser data/)
  })
  it('A-W5: the wallet status switches to "writing" only after the wallet answers eth_sendTransaction', async () => {
    const calls: string[] = []
    const provider = { request: async ({ method }: { method: string }) => (calls.push(method), '0xhash') } as never
    const log: string[] = []
    const wrapped = notifyOnSend(provider, { before: () => log.push('confirm'), after: () => log.push('writing') })
    await wrapped.request({ method: 'eth_chainId' } as never)
    expect(log).toEqual([])
    await wrapped.request({ method: 'eth_sendTransaction' } as never)
    await wrapped.request({ method: 'eth_sendTransaction' } as never) // a retry asks the wallet again
    expect(log).toEqual(['confirm', 'writing', 'confirm', 'writing'])
    expect(calls).toEqual(['eth_chainId', 'eth_sendTransaction', 'eth_sendTransaction'])
    expect(read('../src/pages/send.ts')).toMatch(/Confirm in your wallet/)
  })
  it('N1: an HTTP 5xx says what to do', () => {
    const e = Object.assign(new Error('HTTP request failed.'), { status: 500 })
    expect(explainError(Object.assign(new Error('wrapped'), { cause: e }))).toBe('The Arkiv RPC is having trouble (HTTP 500). Try again in a minute, or use another RPC under Settings.')
  })
  it('T1: the noscript text helps a Tor user', () => {
    expect(read('../index.html')).toMatch(/set the security level to Standard or Safer \(shield icon\), then reload/)
  })
})
