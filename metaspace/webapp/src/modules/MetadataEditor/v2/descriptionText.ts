/** Minimal TipTap/ProseMirror JSON node: block nodes carry `content`, text nodes carry `text`. */
export interface TiptapNode {
  type?: string
  text?: string
  content?: TiptapNode[]
}

const isNode = (value: unknown): value is TiptapNode => typeof value === 'object' && value !== null

const nodeText = (node: TiptapNode): string => {
  if (typeof node.text === 'string') return node.text
  const children = Array.isArray(node.content) ? node.content.filter(isNode) : []
  // inline children (text nodes) concatenate as-is; block children are separated by a space
  const inline = children.length > 0 && children.every((c) => typeof c.text === 'string')
  return children.map(nodeText).join(inline ? '' : ' ')
}

/**
 * Plain text of a TipTap JSON description (the `metaspaceOptions.description` doc): the text of every
 * paragraph/heading/list item, blocks joined with single spaces. Returns '' for null or malformed input.
 */
export const tiptapToPlainText = (doc: unknown): string => {
  if (!isNode(doc)) return ''
  return nodeText(doc).replace(/\s+/g, ' ').trim()
}
