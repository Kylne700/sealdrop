// The one Arkiv reader the pages share. Recreated when the RPC setting changes (the page reloads).
import { createReader, type Reader } from './arkiv'
import { getRpcOverride } from './store'

let reader: Reader | undefined
export const rpcUrl = () => getRpcOverride()
export function getReader() {
  const url = rpcUrl()
  // An access key in the HTTP path works the same on the WebSocket endpoint.
  return (reader ??= createReader({ rpcUrl: url, wsUrl: url?.replace(/^http/, 'ws') }))
}
