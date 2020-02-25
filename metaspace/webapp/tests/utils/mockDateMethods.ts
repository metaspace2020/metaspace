
// must be in past, and must be before tested dates!
const dateNowValue = new Date('2020-01-01T00:00:00.000').valueOf()

const locale = 'en-DE'

export default function() {
  const nowSpy = jest.spyOn(global.Date, 'now').mockImplementation(() => dateNowValue)
  const localeDateSpy = jest.spyOn(global.Date.prototype, 'toLocaleDateString')

  const _toLocaleDateString = global.Date.prototype.toLocaleDateString
  // ts-ignore
  global.Date.prototype.toLocaleDateString = function(_: string | string[], options: Intl.DateTimeFormatOptions) {
    return _toLocaleDateString(locale, options)
  }

  const _toLocaleTimeString = global.Date.prototype.toLocaleTimeString
  global.Date.prototype.toLocaleTimeString = (_: string, options: Intl.DateTimeFormatOptions) => _toLocaleTimeString(locale, options)

  return () => {
    nowSpy.mockRestore()
    global.Date.prototype.toLocaleDateString = _toLocaleDateString
    global.Date.prototype.toLocaleTimeString = _toLocaleTimeString
  }
}
