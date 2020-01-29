import safeJsonParse from './safeJsonParse'
import * as cookie from 'js-cookie'

const memoryStorage: Record<string, string> = {}

export const setLocalStorage = (key: string, value: any, cookieFallback = false) => {
  const json = JSON.stringify(value)
  memoryStorage[key] = json
  try {
    localStorage.setItem(key, json)
  } catch (err) {
    console.error(err)
    if (cookieFallback) {
      try {
        cookie.set('storage_' + key, json, { expires: 90 })
      } catch (err2) { console.error(err2) }
    }
  }
}

export const getLocalStorage = <T>(key: string): (T | undefined) => {
  try {
    const json = localStorage.getItem(key) || memoryStorage[key] || cookie.get('storage_' + key)
    return json && safeJsonParse(json)
  } catch (err) {
    console.error(err)
    return undefined
  }
}

export const removeLocalStorage = (key: string) => {
  delete memoryStorage[key]
  try {
    localStorage.removeItem(key)
  } catch (err) { console.error(err) }
  try {
    cookie.remove('storage_' + key)
  } catch (err) { console.error(err) }
}

export const migrateLocalStorage = () => {
  try {
    // Clean up old data stored by Upload page
    removeLocalStorage('latestMetadataSubmission')
    removeLocalStorage('latestMetadataOptions')
    removeLocalStorage('latestMetadataSubmissionVersion')

    // Convert storage cookies to localStorage
    try {
      const hideReleaseNotes = cookie.getJSON('hideReleaseNotes')
      if (hideReleaseNotes != null) {
        setLocalStorage('hideReleaseNotes', hideReleaseNotes, true)
        cookie.remove('hideReleaseNotes')
      }
    } catch (err) { console.error(err) }
    try {
      const showDescrHint = cookie.getJSON('show_descr_hint') as any
      if (showDescrHint != null) {
        setLocalStorage('hideMarkdownHint', showDescrHint === 0, true)
        cookie.remove('show_descr_hint')
      }
    } catch (err) { console.error(err) }
  } catch (err) { console.error(err) }
}
