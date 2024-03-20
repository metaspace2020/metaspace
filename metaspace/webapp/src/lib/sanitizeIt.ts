import DOMPurify from 'dompurify'

export default function sanitizeIt(descriptionText) {
  const clean = DOMPurify.sanitize(descriptionText, {
    ALLOWED_TAGS: [
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'blockquote',
      'p',
      'a',
      'ul',
      'ol',
      'nl',
      'li',
      'b',
      'i',
      'strong',
      'em',
      'strike',
      'code',
      'hr',
      'br',
      'div',
      'table',
      'thead',
      'caption',
      'tbody',
      'tr',
      'th',
      'td',
      'pre',
      'del',
    ],
    ALLOWED_ATTR: ['href', 'rel'],
    ADD_ATTR: ['target'],
    ADD_TAGS: [''],
    FORBID_TAGS: ['style', 'script', 'iframe', 'object'], // Add tags you want to forbid
  })

  // Manually add rel="noopener noreferrer" to all links
  const parser = new DOMParser()
  const doc = parser.parseFromString(clean, 'text/html')
  const links = doc.querySelectorAll('a')
  links.forEach((link) => {
    link.setAttribute('rel', 'noopener noreferrer')
    link.setAttribute('target', '_blank')
  })

  return doc.body.innerHTML
}
