// Stands in for `vue3-cookies` during the build-time prerender.
//
// The real module reads `document.cookie` the moment a component asks for a
// cookie, which App.vue does while being created. There is no document in
// Node and no visitor whose cookies could matter, so every lookup answers
// "not set". Aliased in by the SSR branch of vite.config.mts.

// Parameter-less on purpose: callers pass keys and values, ignoring them here
// keeps the linter from flagging unused arguments. Type-checking happens
// against the real module, so the stub's signatures are never compared.
const cookies = {
  get: (): string | null => null,
  set: () => cookies,
  remove: () => cookies,
  isKey: () => false,
  keys: (): string[] => [],
}

export const useCookies = () => ({ cookies })

export default { install: () => undefined }
