export default function copyToClipboard(text?: string) {
  if (text) {
    if ('clipboard' in navigator) {
      navigator.clipboard.writeText(text)
    } else {
      const el = document.createElement('textarea')
      el.value = text
      el.style.position = 'absolute'
      el.style.left = '-9999px'
      document.body.appendChild(el)
      try {
        el.select()
        document.execCommand('copy')
      } finally {
        document.body.removeChild(el)
      }
    }
  }
}
