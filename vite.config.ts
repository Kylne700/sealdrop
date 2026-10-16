import { defineConfig } from 'vitest/config'

// BASE_PATH lets the same build run at the root of a domain or under /<repo>/ on GitHub Pages.
// Routing is hash based, so no server rewrite rules are needed anywhere.
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  build: { target: 'es2022', sourcemap: false },
  test: { include: ['test/**/*.test.ts'] },
})
