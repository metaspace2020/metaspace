#!/usr/bin/env node
// Writes a static HTML file for every indexable route, using the SSR bundle
// built by `build-ssr`.
//
// Run after `vite build`; it reads `dist/index.html` as the template and then
// overwrites it with the prerendered home page.

import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(here, '../dist')
const ssrEntry = resolve(here, '../dist-ssr/entry-server.mjs')

// A route that hangs is a bug in the page, not something to wait out: the
// offline Apollo link answers immediately, so nothing here should be slow.
const RENDER_TIMEOUT_MS = 30_000

// If one of these comes out empty the build has failed at its actual purpose,
// so it fails loudly instead of shipping a blank flagship page.
const REQUIRED_ROUTES = ['home', 'pro']

// Only applied to REQUIRED_ROUTES. Data-driven pages legitimately render very
// little without an API - /groups is a single "sign in to create a group" line
// - and that is the page a logged-out crawler would get anyway.
const MIN_REQUIRED_MARKUP_LENGTH = 2000

// The wrapper `document.ts` puts around the rendered markup.
const PRERENDER_MARKER = 'id="prerendered-content"'

// Canonical URLs and sitemap entries always point at production.
const PRODUCTION_ORIGIN = 'https://metaspace2020.org'

function withTimeout(promise, ms, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

async function main() {
  if (!existsSync(ssrEntry)) {
    throw new Error(`SSR bundle not found at ${ssrEntry}. Run "yarn build-ssr" first.`)
  }

  // index.html is both the template and one of the outputs (it becomes the
  // prerendered home page), so a second run without an intervening build would
  // otherwise render the home page into itself.
  const templatePath = resolve(distDir, 'index.html')
  const template = await readFile(templatePath, 'utf8')
  if (template.includes(PRERENDER_MARKER)) {
    throw new Error(`${templatePath} has already been prerendered. Run "yarn build-ci" to rebuild it first.`)
  }

  const { SEO_ROUTES, renderRoute, buildDocument, buildShellDocument, buildSitemapXml } = await import(ssrEntry)

  await writeFile(resolve(distDir, '_shell.html'), buildShellDocument(template), 'utf8')
  console.log('prerender: _shell.html (fallback, noindex)')

  // Written here rather than by a plugin during the Vite build: the route list
  // is the same one driving the prerender, and nothing crawls the output.
  const sitemap = buildSitemapXml(PRODUCTION_ORIGIN, new Date().toISOString())
  await writeFile(resolve(distDir, 'sitemap.xml'), sitemap, 'utf8')
  console.log(`prerender: sitemap.xml (${(sitemap.match(/<loc>/g) || []).length} urls)`)

  const failures = []

  for (const route of SEO_ROUTES) {
    let markup = ''
    try {
      markup = await withTimeout(renderRoute(route.name, route.path), RENDER_TIMEOUT_MS, route.path)
      if (REQUIRED_ROUTES.includes(route.name) && markup.length < MIN_REQUIRED_MARKUP_LENGTH) {
        throw new Error(`rendered only ${markup.length} characters`)
      }
    } catch (error) {
      // A page that cannot be server-rendered still gets its title, meta,
      // canonical, JSON-LD and nav - the parts that fix link previews and AI
      // crawlers - just without the body copy.
      failures.push({ route, error })
      markup = ''
    }

    const html = buildDocument(template, route.name, route.path, markup)
    await writeFile(resolve(distDir, route.file), html, 'utf8')
    const size = markup.length
    console.log(`prerender: ${route.file.padEnd(22)} ${route.path.padEnd(16)} ${size ? `${size} chars` : 'META ONLY'}`)
  }

  if (failures.length > 0) {
    console.warn(`\nprerender: ${failures.length} route(s) rendered meta-only:`)
    for (const { route, error } of failures) {
      console.warn(`  ${route.path}: ${error.message}`)
    }
  }

  const requiredFailures = failures.filter(({ route }) => REQUIRED_ROUTES.includes(route.name))
  if (requiredFailures.length > 0) {
    throw new Error(
      `Required route(s) failed to prerender: ${requiredFailures.map(({ route }) => route.path).join(', ')}`
    )
  }
}

main().catch((error) => {
  console.error('\nprerender failed:', error)
  process.exit(1)
})
