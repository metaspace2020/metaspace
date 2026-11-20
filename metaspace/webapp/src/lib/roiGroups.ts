export interface RoiGroup {
  name: string
  channel: string
}

export interface GroupableRoi {
  id: string | number | null
  name: string
  groupLabel?: string | null
  groupChannel?: string | null
  /** The ROI's own colour (a palette name or an `rgb(...)` string); new group colours avoid it. */
  channel?: string
  /** The ROI's rgb colour; new group colours avoid it. */
  rgb?: string
  removed?: boolean
  isDrawing?: boolean
  coordinates?: unknown[]
}

export interface ResolvedComparison {
  mode: 'vs_rest' | 'two_group'
  groupCount: number
  firstGroup: string
  referenceGroup: string | null
  targets: Array<{ roiId: string | number | null; name: string }>
}

interface Group {
  label: string | null
  displayName: string
  firstRoiId: string | number | null
}

/** Applies toSaveFields to non-removed ROIs, then resolves the comparison. */
export const resolveComparison = (rois: GroupableRoi[], groupMode: boolean): ResolvedComparison | null => {
  const groups = new Map<string, Group>()
  rois.forEach((original, index) => {
    // ROIs that Save would skip (unfinished outline, no vertices) do not take part
    if (
      original.removed ||
      original.isDrawing === true ||
      (original.coordinates && original.coordinates.length === 0)
    ) {
      return
    }
    const roi = { ...original, ...toSaveFields(original, groupMode) }
    if (roi.includeInDiff === false) {
      return
    }
    const label = (roi.groupLabel || '').trim()
    const key = label ? `label:${label}` : `roi:${roi.id ?? `new-${index}`}`
    if (!groups.has(key)) {
      groups.set(key, { label: label || null, displayName: label || roi.name, firstRoiId: roi.id })
    }
  })

  if (groups.size < 2) {
    return null
  }

  const ordered = Array.from(groups.values()).sort((a, b) => {
    if ((a.label != null) !== (b.label != null)) {
      return a.label != null ? -1 : 1
    }
    const aLower = a.displayName.toLowerCase()
    const bLower = b.displayName.toLowerCase()
    if (aLower !== bLower) {
      return aLower < bLower ? -1 : 1
    }
    return a.displayName < b.displayName ? -1 : a.displayName > b.displayName ? 1 : 0
  })

  const twoGroup = ordered.length === 2 && ordered.some((group) => group.label != null)
  return {
    mode: twoGroup ? 'two_group' : 'vs_rest',
    groupCount: ordered.length,
    firstGroup: ordered[0].displayName,
    referenceGroup: twoGroup ? ordered[1].displayName : null,
    targets: (twoGroup ? ordered.slice(0, 1) : ordered).map((group) => ({
      roiId: group.firstRoiId,
      name: group.displayName,
    })),
  }
}

export const formatConsistency = (nRois?: number | null, nConcordant?: number | null): string =>
  nRois != null && nRois > 1 && nConcordant != null ? `${nConcordant}/${nRois} ROIs` : '—'

const trimLabel = (roi: GroupableRoi): string => (roi.groupLabel || '').trim()

const RGB_PATTERN = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/

/** `rgb(r, g, b)` with canonical spacing, or null when the value is not an rgb() literal. */
export const normalizeRgb = (value: string | null | undefined): string | null => {
  const match = RGB_PATTERN.exec((value ?? '').trim())
  return match ? `rgb(${Number(match[1])}, ${Number(match[2])}, ${Number(match[3])})` : null
}

/**
 * `rgb(r, g, b)` -> upper-case `#RRGGBB` (the form Element Plus's hex colour picker emits), or '' when the value is
 * not an rgb() literal with channels in 0-255. Used only at the colour-picker boundary; stored colours stay rgb().
 */
export const rgbToHex = (value: string): string => {
  const match = RGB_PATTERN.exec((value ?? '').trim())
  const parts = match ? [match[1], match[2], match[3]].map(Number) : []
  if (parts.length !== 3 || parts.some((n) => n > 255)) {
    return ''
  }
  return `#${parts.map((n) => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

/** `#RGB` or `#RRGGBB` (any case) -> `rgb(r, g, b)`, or '' for anything else. */
export const hexToRgb = (value: string): string => {
  const match = HEX_PATTERN.exec((value ?? '').trim())
  if (!match) {
    return ''
  }
  const digits = match[1].length === 3 ? match[1].replace(/./g, (d) => d + d) : match[1]
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16))
  return `rgb(${r}, ${g}, ${b})`
}

/** `rgb()` / `rgba()` with comma- or space-separated integer channels and an optional (dropped) alpha. */
const LOOSE_RGB_PATTERN = /^rgba?\(\s*(\d+)(?:\s*,\s*|\s+)(\d+)(?:\s*,\s*|\s+)(\d+)\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/i

/**
 * The colour picker's `#RRGGBB` for a stored colour: a palette name, `rgb(r, g, b)` in any spacing, `rgb(r g b)` /
 * `rgb(r g b / a)`, `rgba(r, g, b, a)` (alpha dropped) or 3/6-digit hex in any case. '' for anything else (e.g.
 * `hsl()`, named CSS colours outside the palette), which the picker cannot represent.
 */
export const toPickerHex = (value: string, channelRgb: Record<string, string>): string => {
  const raw = (value ?? '').trim()
  if (Object.prototype.hasOwnProperty.call(channelRgb, raw)) {
    return toPickerHex(channelRgb[raw], {})
  }
  const fromHex = hexToRgb(raw)
  if (fromHex) {
    return rgbToHex(fromHex)
  }
  const match = LOOSE_RGB_PATTERN.exec(raw)
  return match ? rgbToHex(`rgb(${match[1]}, ${match[2]}, ${match[3]})`) : ''
}

/**
 * CSS colour of a stored colour value (ROI channel, group channel): a palette name resolves to its rgb, an
 * `rgb(...)` string to itself (normalised). Anything else resolves to ''.
 */
export const resolveColor = (value: string, channelRgb: Record<string, string>): string => {
  const paletteRgb = Object.prototype.hasOwnProperty.call(channelRgb, value) ? channelRgb[value] : undefined
  return normalizeRgb(paletteRgb ?? value) ?? paletteRgb ?? ''
}

/**
 * Colour to paint for a stored colour value: `resolveColor`'s rgb, or else the raw value, so any other valid CSS
 * colour (e.g. an imported `#f00`) still shows instead of an empty swatch.
 */
export const displayColor = (value: string, channelRgb: Record<string, string>): string =>
  resolveColor(value, channelRgb) || value

/** `rgb(r, g, b)` -> `rgba(r, g, b, alpha)`. */
const withAlpha = (rgb: string, alpha: number): string => rgb.replace('rgb', 'rgba').replace(')', `, ${alpha})`)

/** Colour fields a ROI stores for a picked colour (a palette name or an `rgb(...)` string). */
export interface RoiColorFields {
  /** Palette name when the colour is a palette colour, else the normalised rgb string. */
  channel: string
  rgb: string
  /** Fill: the rgb at 0.4 alpha. */
  color: string
  /** Stroke: the rgb at 0 alpha. */
  strokeColor: string
}

/** The ROI colour fields for a picked colour, or null when the value is neither a palette name nor an rgb(). */
export const roiColorFields = (value: string, channelRgb: Record<string, string>): RoiColorFields | null => {
  const rgb = resolveColor(value, channelRgb)
  const channel = rgb ? toColorValue(rgb, channelRgb) : null
  if (!rgb || channel == null) {
    return null
  }
  return { channel, rgb, color: withAlpha(rgb, 0.4), strokeColor: withAlpha(rgb, 0) }
}

/** Value to store for a picked rgb colour: the palette name when it is a palette colour, else the rgb string. */
export const toColorValue = (rgb: string, channelRgb: Record<string, string>): string | null => {
  const normalized = normalizeRgb(rgb)
  if (normalized == null) {
    return null
  }
  return Object.keys(channelRgb).find((name) => normalizeRgb(channelRgb[name]) === normalized) ?? normalized
}

/**
 * Groups in first-seen order from non-removed ROIs with a label. The colour is the first member's saved group
 * channel (a palette name or an `rgb(...)` string), or else the one nextGroupChannel picks, avoiding the ROIs' own
 * colours. Pass `channelRgb` so colours are compared by rgb value; without it only names are compared.
 */
export const deriveGroups = (
  rois: GroupableRoi[],
  channelNames: string[],
  channelRgb: Record<string, string> = {}
): RoiGroup[] => {
  const groups: RoiGroup[] = []
  const roiColors = rois
    .filter((roi) => !roi.removed)
    .flatMap((roi) => [roi.rgb, roi.channel])
    .filter((color): color is string => typeof color === 'string' && color !== '')
  rois.forEach((roi) => {
    const name = trimLabel(roi)
    if (roi.removed || !name || groups.some((group) => group.name === name)) {
      return
    }
    const saved = roi.groupChannel ?? ''
    const channel = channelNames.includes(saved)
      ? saved
      : normalizeRgb(saved) ?? nextGroupChannel(groups, channelNames, roiColors, channelRgb)
    groups.push({ name, channel })
  })
  return groups
}

/** 'Group A', 'Group B', ... first letter not in use; 'Group 27', ... after Z. */
export const nextGroupName = (groups: RoiGroup[]): string => {
  const used = new Set(groups.map((group) => group.name.trim().toLowerCase()))
  for (let i = 0; i < 26; i++) {
    const name = `Group ${String.fromCharCode(65 + i)}`
    if (!used.has(name.toLowerCase())) {
      return name
    }
  }
  let n = 27
  while (used.has(`group ${n}`)) {
    n++
  }
  return `Group ${n}`
}

/** Channel tried last for a new group: it is invisible on the white panel. */
const LAST_RESORT_CHANNEL = 'white'

/**
 * Colour for a new group: the last channel of the palette that neither a group nor a ROI uses ('white' is tried
 * last), so groups stand apart from the ROIs, which take colours from the start of the palette.
 * `roiColors` are the ROIs' colours (palette names or `rgb(...)` strings). With `channelRgb` a channel also counts
 * as used when its rgb equals a used colour. Cycles through the palette when every channel is taken.
 */
export const nextGroupChannel = (
  groups: RoiGroup[],
  channelNames: string[],
  roiColors: string[] = [],
  channelRgb: Record<string, string> = {}
): string => {
  const usedValues = [...groups.map((group) => group.channel), ...roiColors]
  const usedNames = new Set(usedValues)
  const usedRgb = new Set(usedValues.map((value) => resolveColor(value, channelRgb)).filter((rgb) => rgb !== ''))
  const isUsed = (channel: string) => {
    const rgb = resolveColor(channel, channelRgb)
    return usedNames.has(channel) || (rgb !== '' && usedRgb.has(rgb))
  }
  const reversed = [...channelNames].reverse()
  const candidates = [
    ...reversed.filter((channel) => channel !== LAST_RESORT_CHANNEL),
    ...reversed.filter((channel) => channel === LAST_RESORT_CHANNEL),
  ]
  return candidates.find((channel) => !isUsed(channel)) ?? channelNames[groups.length % channelNames.length]
}

/** Returns an error message, or null when the name is valid. `except` is the group being renamed. */
export const groupNameError = (name: string, groups: RoiGroup[], except?: string): string | null => {
  const key = name.trim().toLowerCase()
  if (!key) {
    return 'Enter a group name.'
  }
  const exceptKey = except?.trim().toLowerCase()
  if (groups.some((group) => group.name.trim().toLowerCase() === key && key !== exceptKey)) {
    return 'A group with this name already exists.'
  }
  return null
}

/** ROIs whose trimmed label equals `from` get `to` ('' unassigns). Other ROIs are returned as-is. */
export const relabelGroup = <T extends GroupableRoi>(rois: T[], from: string, to: string): T[] =>
  rois.map((roi) => (trimLabel(roi) === from.trim() ? { ...roi, groupLabel: to } : roi))

/** In group mode, recolours grouped ROIs with their group's colour (a palette name or an `rgb(...)` string). */
export const roisForDisplay = <T extends GroupableRoi>(
  rois: T[],
  groups: RoiGroup[],
  groupMode: boolean,
  channelRgb: Record<string, string>
): T[] => {
  if (!groupMode) {
    return rois
  }
  return rois.map((roi) => {
    const group = groups.find((g) => g.name === trimLabel(roi))
    const rgb = group ? resolveColor(group.channel, channelRgb) : ''
    if (!group || !rgb) {
      return roi
    }
    return { ...roi, channel: group.channel, rgb, color: withAlpha(rgb, 0.4), strokeColor: withAlpha(rgb, 0) }
  })
}

/** True when any ROI carries a non-blank group label. */
export const hasSavedGroups = (rois: Array<{ groupLabel?: string | null }>): boolean =>
  rois.some((roi) => (roi.groupLabel || '').trim() !== '')

/** Returns ROIs whose groupChannel matches their group's channel; ROIs already aligned (or ungrouped) are kept as-is. */
export const alignGroupChannels = <T extends GroupableRoi>(rois: T[], groups: RoiGroup[]): T[] =>
  rois.map((roi) => {
    const group = groups.find((g) => g.name === trimLabel(roi))
    return group && roi.groupChannel !== group.channel ? { ...roi, groupChannel: group.channel } : roi
  })

/** Fields persisted for a ROI: group labels only count in group mode. */
export const toSaveFields = (
  roi: GroupableRoi,
  groupMode: boolean
): { groupLabel: string | null; includeInDiff: boolean } => {
  if (!groupMode) {
    return { groupLabel: null, includeInDiff: true }
  }
  const label = trimLabel(roi) || null
  return { groupLabel: label, includeInDiff: label != null }
}
