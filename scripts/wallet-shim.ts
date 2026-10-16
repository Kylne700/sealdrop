// Test-only EIP-1193 wallet for the smoke run. It signs with a throwaway testnet key that never leaves Node;
// the page only sees window.ethereum, exactly like a browser extension would present itself.
import type { Page } from 'puppeteer-core'
import type { Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { CHAIN_ID, RPC_HTTP } from '../src/config'

export async function installWallet(page: Page, privateKey: Hex) {
  const account = privateKeyToAccount(privateKey)
  const rpc = async (method: string, params: unknown[]) => {
    const res = await fetch(RPC_HTTP, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
    const body = (await res.json()) as { result?: unknown; error?: { message: string } }
    if (body.error) throw new Error(body.error.message)
    return body.result
  }
  await page.exposeFunction('__walletCall', async (method: string, paramsJson: string) => {
    const params = JSON.parse(paramsJson) as unknown[]
    switch (method) {
      case 'eth_requestAccounts':
      case 'eth_accounts':
        return JSON.stringify([account.address])
      case 'eth_chainId':
        return JSON.stringify('0x' + CHAIN_ID.toString(16))
      case 'wallet_switchEthereumChain':
      case 'wallet_addEthereumChain':
        return 'null'
      case 'eth_sendTransaction': {
        const tx = params[0] as { to?: Hex; data?: Hex; value?: Hex; gas?: Hex; nonce?: Hex; gasPrice?: Hex; maxFeePerGas?: Hex }
        const nonce = tx.nonce ?? ((await rpc('eth_getTransactionCount', [account.address, 'pending'])) as Hex)
        const gas = tx.gas ?? ((await rpc('eth_estimateGas', [{ from: account.address, to: tx.to, data: tx.data, value: tx.value }])) as Hex)
        const gasPrice = tx.gasPrice ?? tx.maxFeePerGas ?? ((await rpc('eth_gasPrice', [])) as Hex)
        const raw = await account.signTransaction({ type: 'legacy', chainId: CHAIN_ID, to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : 0n, nonce: Number(BigInt(nonce)), gas: BigInt(gas), gasPrice: BigInt(gasPrice) })
        return JSON.stringify(await rpc('eth_sendRawTransaction', [raw]))
      }
      default:
        return JSON.stringify(await rpc(method, params))
    }
  })
  await page.evaluateOnNewDocument(() => {
    const w = window as unknown as { __walletCall: (m: string, p: string) => Promise<string>; ethereum?: unknown }
    const listeners: Record<string, ((...a: unknown[]) => void)[]> = {}
    const provider = {
      request: async ({ method, params }: { method: string; params?: unknown[] }) => JSON.parse(await w.__walletCall(method, JSON.stringify(params ?? []))),
      on(ev: string, fn: () => void) { (listeners[ev] ||= []).push(fn); return provider },
      removeListener(ev: string, fn: () => void) { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); return provider },
    }
    w.ethereum = provider
  })
  return account
}
