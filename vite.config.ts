import { defineConfig } from 'vitest/config'

// Only the production build carries the policy: the dev server injects inline styles and an HMR socket.
// Scripts and styles may only come from the site itself; connections may go anywhere over TLS because
// the Settings page lets a user point the app at their own RPC URL.
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https: wss:; base-uri 'none'; form-action 'none'"

// BASE_PATH lets the same build run at the root of a domain or under /<repo>/ on GitHub Pages.
// Routing is hash based, so no server rewrite rules are needed anywhere.
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  build: { target: 'es2022', sourcemap: false },
  plugins: [{ name: 'sealdrop-csp', apply: 'build', transformIndexHtml: (html) => html.replace('<meta charset="utf-8" />', (m) => `${m}\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`) }],
  test: { include: ['test/**/*.test.ts'] },
})
