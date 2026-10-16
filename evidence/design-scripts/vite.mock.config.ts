// Used by build-mock.sh inside a throwaway copy of the app: every import of ./arkiv is answered by the mock.
import { resolve } from 'node:path'
import { defineConfig, mergeConfig } from 'vite'
import base from './vite.config.ts'

const MOCK = resolve(import.meta.dirname, 'src/__mock_arkiv.ts')
const REAL = resolve(import.meta.dirname, 'src/arkiv.ts')
export default mergeConfig(base, defineConfig({
  plugins: [{
    name: 'mock-arkiv', enforce: 'pre',
    resolveId(source, importer) {
      if (source === 'real-arkiv') return REAL
      if (importer !== MOCK && /(^|\/)arkiv$/.test(source)) return MOCK
    },
  }],
}))
