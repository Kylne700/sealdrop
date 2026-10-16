import { describe, expect, it } from 'vitest'
import { explainError, isOutOfFunds } from '../src/arkiv'

// Error shapes captured from the live testnet (SDK 0.8.1, viem 2.57.7) with a key that holds 0 GLM.
const err = (message: string, extra: object = {}) => Object.assign(new Error(message), extra)
const plainTransfer = err('The total cost (gas * gas fee + value) of executing this transaction exceeds the balance of the account.\n\nDetails: insufficient funds for gas * price + value: have 0 want 5000000000000000')
// Arkiv entity writes fail earlier, in eth_estimateGas, with a different text.
const entityWrite = err('Transaction failed: Execution error without revert data', { cause: err('Transaction creation failed.\n\nDetails: out of gas: gas required exceeds: 0\nVersion: viem@2.57.7') })

describe('out of GLM', () => {
  it('is recognised for a plain transfer and for an Arkiv entity write', () => {
    expect(isOutOfFunds(plainTransfer)).toBe(true)
    expect(isOutOfFunds(entityWrite)).toBe(true)
    expect(explainError(entityWrite)).toMatch(/no testnet GLM left/)
  })
  it('is not claimed for other failures', () => {
    expect(isOutOfFunds(err('execution reverted'))).toBe(false)
    expect(explainError(err('User rejected the request.', { code: 4001 }))).toBe('The request was rejected in the wallet.')
  })
})
