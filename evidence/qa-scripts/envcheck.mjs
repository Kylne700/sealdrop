// Prints the mode and the variable NAMES (never the values) of <dir>/.env.local, and whether git ignores it.
import { statSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const dir = process.argv[2]
const f = `${dir}/.env.local`
console.log('mode', (statSync(f).mode & 0o777).toString(8), '| names:', readFileSync(f, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('=')[0]).join(' '))
console.log('git check-ignore:', execFileSync('git', ['-C', dir, 'check-ignore', '.env.local']).toString().trim() || '(not ignored)')
