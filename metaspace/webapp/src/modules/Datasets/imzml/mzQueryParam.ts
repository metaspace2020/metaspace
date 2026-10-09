import type { LocationQueryValue } from 'vue-router'

/** Name of the route query parameter the annotation page uses to preselect an m/z in the browser. */
export const MZ_QUERY_PARAM = 'mz'

/**
 * Reads a positive, finite m/z from a route query value. Returns null for anything else so the
 * browser page can fall back to its default initial peak.
 */
export const parseMzQueryParam = (value: LocationQueryValue | LocationQueryValue[] | undefined): number | null => {
  const raw = Array.isArray(value) ? value[0] : value
  if (raw == null || raw === '') {
    return null
  }
  const mz = Number(raw)
  return Number.isFinite(mz) && mz > 0 ? mz : null
}
