import { tiptapToPlainText } from './descriptionText'

describe('tiptapToPlainText', () => {
  it('joins paragraph texts with spaces and keeps marked runs together', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Mouse ' },
            { type: 'text', text: 'intestine', marks: [{ type: 'bold' }] },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'DHB matrix' }] },
        { type: 'paragraph' },
      ],
    }
    expect(tiptapToPlainText(doc)).toBe('Mouse intestine DHB matrix')
  })

  it('walks nested lists', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }] },
          ],
        },
      ],
    }
    expect(tiptapToPlainText(doc)).toBe('one two')
  })

  it('returns an empty string for empty or invalid input', () => {
    expect(tiptapToPlainText(null)).toBe('')
    expect(tiptapToPlainText(undefined)).toBe('')
    expect(tiptapToPlainText('text')).toBe('')
    expect(tiptapToPlainText({ type: 'doc', content: [] })).toBe('')
  })
})
