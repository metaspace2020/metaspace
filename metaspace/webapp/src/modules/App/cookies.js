// https://github.com/dobarkod/cookie-banner/blob/4801ba44199009f8a2af88653d6e728057cd108b/src/cookiebanner.js#L79
const Cookies = {
  // @ts-ignore
  get: function (key) {
    return decodeURIComponent(document.cookie.replace(new RegExp('(?:(?:^|.*;)\\s*' + encodeURIComponent(key).replace(/[-.+*]/g, '\\$&') + '\\s*\\=\\s*([^;]*).*$)|^.*$'), '$1')) || null
  },
  // @ts-ignore
  set: function ({ key, val = 1, end = Infinity, path = '/', domain = null, secure = false }) {
    if (!key || /^(?:expires|max-age|path|domain|secure)$/i.test(key)) {
      return false
    }
    var expires = ''
    if (end) {
      switch (end.constructor) {
        case Number:
          expires = end === Infinity ? '; expires=Fri, 31 Dec 9999 23:59:59 GMT' : '; max-age=' + end
          break
        case String:
          expires = '; expires=' + end
          break
        case Date:
          expires = '; expires=' + end.toUTCString()
          break
      }
    }
    document.cookie = encodeURIComponent(key) + '=' + encodeURIComponent(val) + expires + (domain ? '; domain=' + domain : '') + (path ? '; path=' + path : '') + (secure ? '; secure' : '')
    return true
  },
  // @ts-ignore
  has: function (key) {
    return (new RegExp('(?:^|;\\s*)' + encodeURIComponent(key).replace(/[-.+*]/g, '\\$&') + '\\s*\\=')).test(document.cookie)
  },
  // @ts-ignore
  remove: function (key, path, domain) {
    if (!key || !this.has(key)) { return false }
    document.cookie = encodeURIComponent(key) + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT' + (domain ? '; domain=' + domain : '') + (path ? '; path=' + path : '')
    return true
  },
}

export default Cookies
