// QA B2-3 / C8: a bad key file gives a message with a next step, never a raw parser error.
import { describe, expect, it } from 'vitest'
import { parseIdentity } from '../src/store'

describe('key file import errors', () => {
  it('name the problem and say which file to choose', () => {
    for (const text of ['hello', '{"v":1}', '{"v":1,"kind":"local","address":"0x0"}']) {
      expect(() => parseIdentity(text)).toThrow(/Choose the key file Sealdrop exported/)
      expect(() => parseIdentity(text)).not.toThrow(/Unexpected token|JSON/)
    }
  })
})
