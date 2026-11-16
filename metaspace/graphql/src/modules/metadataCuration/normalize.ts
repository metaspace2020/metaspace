const PLACEHOLDERS = new Set([
  '',
  'none',
  'n/a',
  'na',
  '-',
  '--',
  'not applicable',
  'not specified',
  'null',
  'unknown',
  'unspecified',
])

const isBarePlaceholder = (text: string): boolean => PLACEHOLDERS.has(text.trim().replace(/\s+/g, ' ').toLowerCase())

/** lowercase, collapse whitespace, drop a trailing "(…)" such as "Mus musculus (mouse)". */
export function normalizeCurationText(text: string | null | undefined): string {
  return (text || '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * True for values that carry no information: "none", "N/A", … and their parenthetical variants such as
 * "(none)", "N/A (unknown)" or "- (n/a)". Every part (outside and inside the parentheses) must be a placeholder,
 * so "Mus musculus (none)" and "(liver)" are real values.
 */
export function isPlaceholderText(text: string | null | undefined): boolean {
  const value = text || ''
  const inner: string[] = []
  const outside = value.replace(/\(([^()]*)\)/g, (_, content: string) => {
    inner.push(content)
    return ' '
  })
  return isBarePlaceholder(outside) && inner.every(isBarePlaceholder)
}
