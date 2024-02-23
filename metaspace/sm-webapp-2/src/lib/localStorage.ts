import safeJsonParse from './safeJsonParse'
import { useCookies } from 'vue3-cookies'

const memoryStorage: Record<string, string> = {}
const { cookies } = useCookies()
const DAY = 24 * 60 * 60

export const setLocalStorage = (key: string, value: any, cookieFallback = false) => {
  const json = JSON.stringify(value)
  memoryStorage[key] = json
  try {
    localStorage.setItem(key, json)
  } catch (err) {
    console.error(err)
    if (cookieFallback) {
      try {
        cookies.set('storage_' + key, json, 90 * DAY)
      } catch (err2) {
        console.error(err2)
      }
    }
  }
}

export const getLocalStorage = <T>(key: string): T | undefined => {
  try {
    const json = localStorage.getItem(key) || memoryStorage[key] || JSON.stringify(cookies.get('storage_' + key))
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
  } catch (err) {
    console.error(err)
  }
  try {
    cookies.remove('storage_' + key)
  } catch (err) {
    console.error(err)
  }
}

export const migrateLocalStorage = () => {
  try {
    // Clean up old data stored by Upload page
    removeLocalStorage('latestMetadataSubmission')
    removeLocalStorage('latestMetadataOptions')
    removeLocalStorage('latestMetadataSubmissionVersion')

    // Convert storage cookies to localStorage
    try {
      const hideReleaseNotes = cookies.get('hideReleaseNotes')
      if (hideReleaseNotes != null) {
        setLocalStorage('hideReleaseNotes', hideReleaseNotes, true)
        cookies.remove('hideReleaseNotes')
      }
    } catch (err) {
      console.error(err)
    }
    try {
      const showDescrHint = cookies.get('show_descr_hint') as any
      if (showDescrHint != null) {
        setLocalStorage('hideMarkdownHint', showDescrHint === 0, true)
        cookies.remove('show_descr_hint')
      }
    } catch (err) {
      console.error(err)
    }
  } catch (err) {
    console.error(err)
  }
}
