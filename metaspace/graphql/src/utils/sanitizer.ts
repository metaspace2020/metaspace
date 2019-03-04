const sanitizeHtml = require('sanitize-html');

export default function sanitizer (descriptionText: string) {
  return sanitizeHtml(
    descriptionText,
    {
      allowedTags: [ 'h3', 'h4', 'h5', 'h6', 'blockquote', 'p', 'a', 'ul', 'ol',
        'nl', 'li', 'b', 'i', 'strong', 'em', 'strike', 'code', 'hr', 'br', 'div',
        'table', 'thead', 'caption', 'tbody', 'tr', 'th', 'td', 'pre'],
      allowedAttributes: {
        'a': ['href', 'rel']
      },
      transformTags: {
        'a': sanitizeHtml.simpleTransform('a', {rel: 'nofollow noopener noreferrer'})
      },
    });
};
