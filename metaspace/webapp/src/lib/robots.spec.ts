import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Pins the policy in public/robots.txt: AI search and assistants may read the
// site, AI training may not, and search engines are untouched. The file is
// easy to edit by hand and easy to get subtly wrong - a bot matches only its
// most specific group - so the parse below mirrors how a crawler reads it.

const robots = readFileSync(resolve(__dirname, '../../public/robots.txt'), 'utf8')

type Group = { agents: string[]; rules: { type: 'allow' | 'disallow'; path: string }[] }

function parseGroups(text: string): Group[] {
  const groups: Group[] = []
  let current: Group | null = null
  let lastWasAgent = false
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*/, '').trim()
    if (!line) {
      continue
    }
    const [key, ...rest] = line.split(':')
    const value = rest.join(':').trim()
    const field = key.trim().toLowerCase()
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
    } else if (field === 'allow' || field === 'disallow') {
      lastWasAgent = false
      current?.rules.push({ type: field, path: value })
    } else {
      lastWasAgent = false
    }
  }
  return groups
}

/** The rules a crawler with this user agent would follow. */
function rulesFor(agent: string) {
  const groups = parseGroups(robots)
  const own = groups.find((g) => g.agents.includes(agent.toLowerCase()))
  return (own ?? groups.find((g) => g.agents.includes('*')))?.rules ?? []
}

const isBlockedFromEverything = (agent: string) => rulesFor(agent).some((r) => r.type === 'disallow' && r.path === '/')

// Google's matching, which the other crawlers follow: `*` is a wildcard, `$`
// anchors the end, and of all rules matching a URL the longest wins, with
// Allow beating Disallow on a tie.
const ruleToRegex = (path: string) =>
  new RegExp(
    '^' +
      path
        .replace(/[.+?^{}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\\\$$/, '$')
  )

function mayFetch(agent: string, url: string): boolean {
  const matching = rulesFor(agent).filter((r) => ruleToRegex(r.path).test(url))
  if (matching.length === 0) {
    return true
  }
  matching.sort((a, b) => b.path.length - a.path.length || (a.type === 'allow' ? -1 : 1))
  return matching[0].type === 'allow'
}

describe('robots.txt', () => {
  it.each(['GPTBot', 'ClaudeBot', 'Google-Extended', 'CCBot', 'Applebot-Extended', 'meta-externalagent', 'Bytespider'])(
    'blocks the training crawler %s from everything',
    (agent) => {
      expect(isBlockedFromEverything(agent)).toBe(true)
    }
  )

  it.each([
    'Googlebot',
    'Bingbot',
    'OAI-SearchBot',
    'ChatGPT-User',
    'Claude-SearchBot',
    'Claude-User',
    'PerplexityBot',
    'Applebot',
  ])('lets the search or assistant crawler %s read the pages', (agent) => {
    expect(isBlockedFromEverything(agent)).toBe(false)
    expect(rulesFor(agent)).toContainEqual({ type: 'allow', path: '/' })
  })

  it.each(['/fs/optical_images/abc.png', '/fs/ion_thumbnails/x.png', '/db/iso_images/x', '/mol-images/HMDB/1.svg'])(
    'keeps crawlers off the dataset image endpoint %s',
    (url) => {
      expect(mayFetch('Googlebot', url)).toBe(false)
    }
  )

  it('leaves static images alone - the og:image above all, or link previews lose their picture', () => {
    for (const url of ['/assets/logo.png', '/assets/METASPACE_logomark.png', '/docs/screenshot.png']) {
      expect(mayFetch('Googlebot', url), url).toBe(true)
    }
  })

  it('does not block the pages, scripts or styles the app needs', () => {
    for (const url of ['/', '/pro', '/assets/index.js', '/assets/index.css', '/docs/', '/sitemap.xml']) {
      expect(mayFetch('Googlebot', url), url).toBe(true)
    }
  })

  it('advertises both sitemaps', () => {
    expect(robots).toContain('Sitemap: https://metaspace2020.org/sitemap.xml')
    expect(robots).toContain('Sitemap: https://metaspace2020.org/docs/sitemap.xml')
  })
})
