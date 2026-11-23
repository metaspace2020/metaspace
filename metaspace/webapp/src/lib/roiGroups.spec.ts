import { describe, it, expect } from 'vitest'
import {
  alignGroupChannels,
  comparisonFromResults,
  deriveGroups,
  displayColor,
  formatConsistency,
  groupNameError,
  hasSavedGroups,
  hexToRgb,
  isGroupedRun,
  nextGroupChannel,
  nextGroupName,
  normalizeRgb,
  relabelGroup,
  resolveColor,
  resolveComparison,
  toPickerHex,
  rgbToHex,
  roiColorFields,
  roisForDisplay,
  syncClosedOutlines,
  toColorValue,
  toSaveFields,
} from './roiGroups'
import { roisToFeatureCollection } from './roiGeoJson'

const CHANNELS = ['magenta', 'green', 'blue', 'red', 'yellow', 'cyan', 'orange', 'violet', 'white']
const CHANNEL_RGB: Record<string, string> = {
  magenta: 'rgb(255, 0, 255)',
  cyan: 'rgb(0, 255, 255)',
}

const rois = (spec: Array<[string, string | null, boolean?]>) =>
  spec.map(([id, groupLabel, removed]) => ({ id, name: `roi-${id}`, groupLabel, removed }))

describe('resolveComparison', () => {
  it('treats unlabeled ROIs as vs_rest singletons', () => {
    const result = resolveComparison(
      rois([
        ['1', null],
        ['2', ' '],
        ['3', null],
      ]),
      false
    )
    expect(result).toMatchObject({ mode: 'vs_rest', groupCount: 3, referenceGroup: null })
  })

  it('keeps two unlabeled ROIs as vs_rest', () => {
    expect(
      resolveComparison(
        rois([
          ['1', null],
          ['2', null],
        ]),
        false
      )?.mode
    ).toBe('vs_rest')
  })

  it('compares the alphabetically first group against the other in two_group mode', () => {
    const result = resolveComparison(
      rois([
        ['1', 'b'],
        ['2', 'A'],
        ['3', 'b'],
      ]),
      true
    )
    expect(result).toMatchObject({ mode: 'two_group', firstGroup: 'A', referenceGroup: 'b' })
  })

  it('returns null with fewer than two groups', () => {
    expect(
      resolveComparison(
        rois([
          ['1', 'g'],
          ['2', 'g'],
        ]),
        true
      )
    ).toBeNull()
  })
})

describe('targets and consistency', () => {
  it('lists only the scored group in two_group mode and every group in vs_rest', () => {
    expect(
      resolveComparison(
        rois([
          ['1', 'b'],
          ['2', 'a'],
          ['3', 'b'],
        ]),
        true
      )?.targets
    ).toEqual([{ roiId: '2', name: 'a' }])
    expect(
      resolveComparison(
        rois([
          ['1', 'g'],
          ['2', 'g'],
          ['3', null],
        ]),
        false
      )?.targets
    ).toEqual([
      { roiId: '1', name: 'roi-1' },
      { roiId: '2', name: 'roi-2' },
      { roiId: '3', name: 'roi-3' },
    ])
  })

  it('formats consistency with a dash for singletons', () => {
    expect(formatConsistency(4, 3)).toBe('3/4 ROIs')
    expect(formatConsistency(1, null)).toBe('—')
    expect(formatConsistency(undefined, undefined)).toBe('—')
  })
})

const r = (id: string, groupLabel: string | null, extra: Record<string, unknown> = {}) => ({
  id,
  name: `roi-${id}`,
  groupLabel,
  ...extra,
})

describe('deriveGroups', () => {
  it('derives groups in first-seen order, skipping blank and removed ROIs', () => {
    const result = deriveGroups(
      [r('1', 'A', { groupChannel: 'cyan' }), r('2', 'A'), r('3', 'B'), r('4', ' '), r('5', 'C', { removed: true })],
      CHANNELS
    )
    expect(result).toEqual([
      { name: 'A', channel: 'cyan' },
      { name: 'B', channel: 'violet' },
    ])
  })

  it('falls back to the next unused channel for an unknown channel', () => {
    expect(deriveGroups([r('1', 'A', { groupChannel: 'nope' })], CHANNELS)).toEqual([{ name: 'A', channel: 'violet' }])
  })
})

describe('deriveGroups channel assignment', () => {
  it('colours labels without a channel from the end of the palette', () => {
    expect(deriveGroups([r('1', 'A'), r('2', 'B'), r('3', 'C')], CHANNELS)).toEqual([
      { name: 'A', channel: 'violet' },
      { name: 'B', channel: 'orange' },
      { name: 'C', channel: 'cyan' },
    ])
  })

  it('skips channels already held by an earlier group', () => {
    expect(deriveGroups([r('1', 'A', { groupChannel: 'violet' }), r('2', 'B'), r('3', 'C')], CHANNELS)).toEqual([
      { name: 'A', channel: 'violet' },
      { name: 'B', channel: 'orange' },
      { name: 'C', channel: 'cyan' },
    ])
  })

  it('skips channels used by the non-removed ROIs themselves', () => {
    const input = [
      r('1', 'A', { channel: 'violet' }),
      r('2', null, { channel: 'orange' }),
      r('3', 'B', { channel: 'cyan', removed: true }),
      r('4', 'C', { channel: 'magenta' }),
    ]
    expect(deriveGroups(input, CHANNELS)).toEqual([
      { name: 'A', channel: 'cyan' },
      { name: 'C', channel: 'yellow' },
    ])
  })

  it('wraps after every channel is used', () => {
    const labels = 'ABCDEFGHIJK'.split('')
    const result = deriveGroups(
      labels.map((l, i) => r(String(i), l)),
      CHANNELS
    )
    expect(result).toHaveLength(11)
    expect(result.slice(0, 9).map((g) => g.channel)).toEqual([
      'violet',
      'orange',
      'cyan',
      'yellow',
      'red',
      'blue',
      'green',
      'magenta',
      'white',
    ])
    expect(result[9].channel).toBe(CHANNELS[0])
    expect(result[10].channel).toBe(CHANNELS[1])
  })
})

describe('nextGroupName', () => {
  it('starts at Group A and skips used letters case-insensitively', () => {
    expect(nextGroupName([])).toBe('Group A')
    expect(
      nextGroupName([
        { name: 'Group A', channel: 'x' },
        { name: 'group b', channel: 'y' },
      ])
    ).toBe('Group C')
  })

  it('continues with numbers after Z', () => {
    const groups = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => ({ name: `Group ${l}`, channel: 'x' }))
    expect(nextGroupName(groups)).toBe('Group 27')
  })
})

describe('nextGroupChannel', () => {
  it('picks the last unused channel, trying white last', () => {
    expect(nextGroupChannel([], CHANNELS)).toBe('violet')
    expect(nextGroupChannel([{ name: 'A', channel: 'violet' }], CHANNELS)).toBe('orange')
  })

  it('skips channels used by ROIs as well as by groups', () => {
    const roiChannels = ['magenta', 'green', 'blue', 'red', 'yellow']
    expect(nextGroupChannel([], CHANNELS, roiChannels)).toBe('violet')
    expect(nextGroupChannel([{ name: 'A', channel: 'violet' }], CHANNELS, roiChannels)).toBe('orange')
    expect(nextGroupChannel([{ name: 'A', channel: 'cyan' }], CHANNELS, ['violet', 'orange'])).toBe('yellow')
  })

  it('uses white only when every other channel is taken', () => {
    const others = CHANNELS.filter((channel) => channel !== 'white')
    expect(nextGroupChannel([], CHANNELS, others)).toBe('white')
  })

  it('wraps when every channel is used', () => {
    const groups = CHANNELS.map((channel, i) => ({ name: `G${i}`, channel }))
    expect(nextGroupChannel(groups, CHANNELS)).toBe(CHANNELS[0])
    expect(nextGroupChannel([{ name: 'A', channel: 'white' }], CHANNELS, CHANNELS)).toBe(CHANNELS[1])
  })
})

describe('nextGroupChannel wrapping', () => {
  it('continues cycling past ten groups', () => {
    const groups = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `G${i}`, channel: CHANNELS[i % 9] }))
    expect(nextGroupChannel(groups(10), CHANNELS)).toBe(CHANNELS[1])
    expect(nextGroupChannel(groups(11), CHANNELS)).toBe(CHANNELS[2])
  })
})

describe('groupNameError', () => {
  const groups = [{ name: 'Group A', channel: 'cyan' }]
  it('validates blank, duplicate and renamed names', () => {
    expect(groupNameError('  ', groups)).toBe('Enter a group name.')
    expect(groupNameError(' group a', groups)).toBe('A group with this name already exists.')
    expect(groupNameError('Group A', groups, 'Group A')).toBeNull()
    expect(groupNameError('Group B', groups)).toBeNull()
  })
})

describe('relabelGroup', () => {
  it('relabels or unassigns only matching ROIs', () => {
    const input = [r('1', 'A'), r('2', ' A '), r('3', 'B')]
    const out = relabelGroup(input, 'A', '')
    expect(out.map((x) => x.groupLabel)).toEqual(['', '', 'B'])
    expect(out[2]).toBe(input[2])
    expect(input[0].groupLabel).toBe('A')
  })
})

describe('roisForDisplay', () => {
  const input = [
    { ...r('1', 'A'), channel: 'magenta', rgb: 'x', color: 'x', strokeColor: 'x' },
    { ...r('2', null), channel: 'magenta', rgb: 'x', color: 'x', strokeColor: 'x' },
  ]
  const groups = [{ name: 'A', channel: 'cyan' }]

  it('returns the same objects when group mode is off', () => {
    const out = roisForDisplay(input, groups, false, CHANNEL_RGB)
    expect(out[0]).toBe(input[0])
    expect(out[1]).toBe(input[1])
  })

  it('recolours grouped ROIs when group mode is on', () => {
    const out = roisForDisplay(input, groups, true, CHANNEL_RGB)
    expect(out[0]).toMatchObject({
      channel: 'cyan',
      rgb: 'rgb(0, 255, 255)',
      color: 'rgba(0, 255, 255, 0.4)',
      strokeColor: 'rgba(0, 255, 255, 0)',
    })
    expect(out[1]).toBe(input[1])
  })
})

describe('toSaveFields', () => {
  it('maps group mode and label to save fields', () => {
    expect(toSaveFields(r('1', ' A '), true)).toEqual({ groupLabel: 'A', includeInDiff: true })
    expect(toSaveFields(r('1', ' '), true)).toEqual({ groupLabel: null, includeInDiff: false })
    expect(toSaveFields(r('1', 'A'), false)).toEqual({ groupLabel: null, includeInDiff: true })
    expect(toSaveFields(r('1', null), false)).toEqual({ groupLabel: null, includeInDiff: true })
  })
})

describe('resolveComparison with group mode', () => {
  it('compares two groups and ignores ungrouped ROIs', () => {
    const result = resolveComparison(
      rois([
        ['1', 'a'],
        ['2', 'b'],
        ['3', null],
      ]),
      true
    )
    expect(result).toMatchObject({ mode: 'two_group', groupCount: 2 })
  })

  it('returns null with one group and ungrouped ROIs', () => {
    expect(
      resolveComparison(
        rois([
          ['1', 'a'],
          ['2', null],
          ['3', null],
        ]),
        true
      )
    ).toBeNull()
  })

  it('does not count the group of a removed ROI', () => {
    expect(
      resolveComparison(
        rois([
          ['1', 'a'],
          ['2', 'b', true],
        ]),
        true
      )
    ).toBeNull()
  })

  it('ignores labels when group mode is off', () => {
    const result = resolveComparison(
      rois([
        ['1', 'a'],
        ['2', 'a'],
        ['3', 'b'],
      ]),
      false
    )
    expect(result).toMatchObject({ mode: 'vs_rest', groupCount: 3 })
  })
})

describe('alignGroupChannels', () => {
  const groups = [
    { name: 'A', channel: 'red' },
    { name: 'B', channel: 'blue' },
  ]

  it('only replaces ROIs whose channel differs from their group', () => {
    const ok = { id: '1', name: 'r1', groupLabel: 'A', groupChannel: 'red' }
    const off = { id: '2', name: 'r2', groupLabel: ' B ', groupChannel: 'green' }
    const missing = { id: '3', name: 'r3', groupLabel: 'A' }
    const none = { id: '4', name: 'r4', groupLabel: '', groupChannel: 'green' }
    const unknown = { id: '5', name: 'r5', groupLabel: 'Z', groupChannel: 'green' }
    const result = alignGroupChannels([ok, off, missing, none, unknown], groups)
    expect(result[0]).toBe(ok)
    expect(result[1]).toEqual({ ...off, groupChannel: 'blue' })
    expect(result[2]).toEqual({ ...missing, groupChannel: 'red' })
    expect(result[3]).toBe(none)
    expect(result[4]).toBe(unknown)
  })
})

describe('resolveComparison with unsaved ROIs', () => {
  const base = (id: string, label: string | null, extra: Record<string, unknown> = {}) => ({
    id,
    name: `ROI ${id}`,
    groupLabel: label,
    coordinates: [{ x: 0, y: 0 }],
    ...extra,
  })

  it('ignores a drawing ROI assigned to a second group', () => {
    expect(resolveComparison([base('1', 'A'), base('2', 'B', { isDrawing: true })], true)).toBeNull()
  })

  it('ignores a ROI without coordinates when group mode is off', () => {
    expect(resolveComparison([base('1', null), base('2', null, { coordinates: [] })], false)).toBeNull()
  })

  it('still counts finished ROIs and ROIs without a coordinates field', () => {
    expect(resolveComparison([base('1', 'A'), base('2', 'B')], true)).not.toBeNull()
    expect(
      resolveComparison(
        [
          { id: '1', name: 'a' },
          { id: '2', name: 'b' },
        ],
        false
      )
    ).not.toBeNull()
  })
})

describe('hasSavedGroups', () => {
  it('is true only when a label is non-blank', () => {
    expect(hasSavedGroups([{ groupLabel: null }, { groupLabel: '  ' }, {}])).toBe(false)
    expect(hasSavedGroups([{ groupLabel: null }, { groupLabel: ' A ' }])).toBe(true)
    expect(hasSavedGroups([])).toBe(false)
  })
})

const PALETTE: Record<string, string> = {
  magenta: 'rgb(255, 0, 255)',
  green: 'rgb(0, 255, 0)',
  blue: 'rgb(0, 0, 255)',
  red: 'rgb(255, 0, 0)',
  yellow: 'rgb(255, 255, 0)',
  cyan: 'rgb(0, 255, 255)',
  orange: 'rgb(255, 128, 0)',
  violet: 'rgb(128, 0, 255)',
  white: 'rgb(255, 255, 255)',
}

describe('colour values', () => {
  it('normalises rgb() spacing and rejects anything else', () => {
    expect(normalizeRgb('rgb(255,0, 255 )')).toBe('rgb(255, 0, 255)')
    expect(normalizeRgb('#ff00ff')).toBeNull()
    expect(normalizeRgb('rgba(1, 2, 3, 0.4)')).toBeNull()
    expect(normalizeRgb(undefined)).toBeNull()
  })

  it('resolveColor maps a palette name to its rgb and an rgb() string to itself', () => {
    expect(resolveColor('cyan', PALETTE)).toBe('rgb(0, 255, 255)')
    expect(resolveColor('rgb(1,2,3)', PALETTE)).toBe('rgb(1, 2, 3)')
    expect(resolveColor('nope', PALETTE)).toBe('')
  })

  it('toColorValue stores a palette name when the rgb is a palette colour, else the rgb string', () => {
    expect(toColorValue('rgb(128,0,255)', PALETTE)).toBe('violet')
    expect(toColorValue('rgb(10, 20, 30)', PALETTE)).toBe('rgb(10, 20, 30)')
    expect(toColorValue('#123456', PALETTE)).toBeNull()
  })
})

describe('arbitrary group colours', () => {
  it('deriveGroups keeps a saved rgb() groupChannel', () => {
    expect(deriveGroups([r('1', 'A', { groupChannel: 'rgb(10,20,30)' })], CHANNELS, PALETTE)).toEqual([
      { name: 'A', channel: 'rgb(10, 20, 30)' },
    ])
  })

  it('roisForDisplay draws grouped ROIs in an rgb() group colour', () => {
    const input = [{ ...r('1', 'A'), channel: 'magenta', rgb: 'x', color: 'x', strokeColor: 'x' }]
    const out = roisForDisplay(input, [{ name: 'A', channel: 'rgb(10, 20, 30)' }], true, PALETTE)
    expect(out[0]).toMatchObject({
      channel: 'rgb(10, 20, 30)',
      rgb: 'rgb(10, 20, 30)',
      color: 'rgba(10, 20, 30, 0.4)',
      strokeColor: 'rgba(10, 20, 30, 0)',
    })
  })

  it('the default colour skips palette colours that ROIs use by rgb value', () => {
    expect(nextGroupChannel([], CHANNELS, ['rgb(128,0,255)'], PALETTE)).toBe('orange')
    expect(
      nextGroupChannel([{ name: 'A', channel: 'rgb(255, 128, 0)' }], CHANNELS, ['rgb(128, 0, 255)'], PALETTE)
    ).toBe('cyan')
  })

  it('deriveGroups avoids the ROIs own rgb colours', () => {
    const input = [
      r('1', 'A', { rgb: 'rgb(128, 0, 255)', channel: 'rgb(128, 0, 255)' }),
      r('2', 'B', { rgb: 'rgb(1, 2, 3)' }),
    ]
    expect(deriveGroups(input, CHANNELS, PALETTE)).toEqual([
      { name: 'A', channel: 'orange' },
      { name: 'B', channel: 'cyan' },
    ])
  })
})

describe('displayColor', () => {
  it('paints the resolved rgb, or else the raw value so any CSS colour still shows', () => {
    expect(displayColor('magenta', CHANNEL_RGB)).toBe('rgb(255, 0, 255)')
    expect(displayColor('rgb(1,2,3)', CHANNEL_RGB)).toBe('rgb(1, 2, 3)')
    expect(resolveColor('#f00', CHANNEL_RGB)).toBe('')
    expect(displayColor('#f00', CHANNEL_RGB)).toBe('#f00')
  })
})

describe('roiColorFields', () => {
  const PALETTE: Record<string, string> = { violet: 'rgb(128, 0, 255)', red: 'rgb(255, 0, 0)' }

  it('stores a palette pick under its palette name, with fill and stroke rgba', () => {
    expect(roiColorFields('rgb(128, 0, 255)', PALETTE)).toEqual({
      channel: 'violet',
      rgb: 'rgb(128, 0, 255)',
      color: 'rgba(128, 0, 255, 0.4)',
      strokeColor: 'rgba(128, 0, 255, 0)',
    })
    expect(roiColorFields('violet', PALETTE)?.channel).toBe('violet')
  })

  it('stores a custom pick as its rgb string', () => {
    expect(roiColorFields('rgb(18, 52, 86)', PALETTE)).toEqual({
      channel: 'rgb(18, 52, 86)',
      rgb: 'rgb(18, 52, 86)',
      color: 'rgba(18, 52, 86, 0.4)',
      strokeColor: 'rgba(18, 52, 86, 0)',
    })
  })

  it('rejects a value that is neither a palette name nor an rgb()', () => {
    expect(roiColorFields('#f00', PALETTE)).toBeNull()
  })
})

describe('toPickerHex', () => {
  it('turns any colour the picker can show into upper-case #RRGGBB', () => {
    expect(toPickerHex('#f00', PALETTE)).toBe('#FF0000')
    expect(toPickerHex('#Ff8000', PALETTE)).toBe('#FF8000')
    expect(toPickerHex('rgb(18, 52, 86)', PALETTE)).toBe('#123456')
    expect(toPickerHex('rgb(18,52,86)', PALETTE)).toBe('#123456')
    expect(toPickerHex('rgba(18, 52, 86, 0.4)', PALETTE)).toBe('#123456')
    expect(toPickerHex('rgb(18 52 86)', PALETTE)).toBe('#123456')
    expect(toPickerHex('rgb(18 52 86 / 0.4)', PALETTE)).toBe('#123456')
    expect(toPickerHex('violet', PALETTE)).toBe('#8000FF')
  })

  it('returns an empty string for what it cannot parse', () => {
    expect(toPickerHex('hsl(0, 100%, 50%)', PALETTE)).toBe('')
    expect(toPickerHex('red', {})).toBe('')
    expect(toPickerHex('rgb(256, 0, 0)', PALETTE)).toBe('')
    expect(toPickerHex('', PALETTE)).toBe('')
  })
})

describe('hex conversion at the colour-picker boundary', () => {
  it('rgbToHex writes upper-case #RRGGBB with two digits per channel', () => {
    expect(rgbToHex('rgb(18, 52, 86)')).toBe('#123456')
    expect(rgbToHex('rgb(10,20,30)')).toBe('#0A141E')
    expect(rgbToHex('rgb(255, 128, 0)')).toBe('#FF8000')
  })

  it('rgbToHex returns an empty string for anything that is not an rgb() literal', () => {
    expect(rgbToHex('')).toBe('')
    expect(rgbToHex('violet')).toBe('')
    expect(rgbToHex('#123456')).toBe('')
    expect(rgbToHex('rgb(256, 0, 0)')).toBe('')
  })

  it('hexToRgb accepts 3- and 6-digit hex in any case', () => {
    expect(hexToRgb('#123456')).toBe('rgb(18, 52, 86)')
    expect(hexToRgb('#abcdef')).toBe('rgb(171, 205, 239)')
    expect(hexToRgb('#ABCDEF')).toBe('rgb(171, 205, 239)')
    expect(hexToRgb('#f80')).toBe('rgb(255, 136, 0)')
    expect(hexToRgb(' #F80 ')).toBe('rgb(255, 136, 0)')
  })

  it('hexToRgb returns an empty string for invalid input', () => {
    expect(hexToRgb('')).toBe('')
    expect(hexToRgb('123456')).toBe('')
    expect(hexToRgb('#12345')).toBe('')
    expect(hexToRgb('#12345g')).toBe('')
    expect(hexToRgb('rgb(1, 2, 3)')).toBe('')
  })

  it('round-trips all nine palette colours and maps a palette hex back to its name', () => {
    Object.entries(PALETTE).forEach(([name, rgb]) => {
      const hex = rgbToHex(rgb)
      expect(hex).toMatch(/^#[0-9A-F]{6}$/)
      expect(hexToRgb(hex)).toBe(rgb)
      expect(hexToRgb(hex.toLowerCase())).toBe(rgb)
      expect(toColorValue(hexToRgb(hex), PALETTE)).toBe(name)
    })
    expect(toColorValue(hexToRgb('#8000FF'), PALETTE)).toBe('violet')
  })
})

describe('drawing a ROI in group view', () => {
  const panelRoi = (id: string, groupLabel: string, isDrawing: boolean) => ({
    id,
    name: `roi-${id}`,
    groupLabel,
    channel: 'green',
    rgb: 'rgb(0, 255, 0)',
    color: 'rgba(0, 255, 0, 0.4)',
    strokeColor: 'rgba(0, 255, 0, 0)',
    visible: true,
    allVisible: true,
    isDrawing,
    coordinates: [
      { x: 1, y: 1 },
      { x: 5, y: 1 },
      { x: 5, y: 5 },
    ],
  })
  const groups = [{ name: 'A', channel: 'magenta' }]

  /** What addRoiCoordinate (AnnotationView) does to the store's array when the outline is closed. */
  const closeLastOutline = (stored: Array<{ isDrawing?: boolean }>) => {
    stored[stored.length - 1] = { ...stored[stored.length - 1], isDrawing: false }
  }

  it('ends with a closed ROI that Save, Export and the comparison include', () => {
    const panel = [panelRoi('1', 'A', false), panelRoi('2', 'A', false), panelRoi('3', '', true)]
    const stored = roisForDisplay(panel, groups, true, CHANNEL_RGB)
    expect(stored).not.toBe(panel) // group view commits a copy, so the viewer's change does not reach the panel

    closeLastOutline(stored)
    syncClosedOutlines(panel, stored)

    expect(panel[2].isDrawing).toBe(false)
    // Save keeps the ROIs that pass this check (handleSave in RoiSettings); Export uses roisToFeatureCollection
    expect(panel.filter((roi) => !roi.isDrawing && roi.coordinates.length > 0)).toHaveLength(3)
    expect(roisToFeatureCollection(panel, { datasetId: 'ds' }).features.map((f) => f.properties.name)).toEqual([
      'roi-1',
      'roi-2',
      'roi-3',
    ])
  })

  it('also closes a ROI that was given a group while being drawn', () => {
    const panel = [panelRoi('1', 'A', false), panelRoi('2', 'A', true)]
    const stored = roisForDisplay(panel, groups, true, CHANNEL_RGB)
    expect(stored[1]).not.toBe(panel[1])

    closeLastOutline(stored)
    syncClosedOutlines(panel, stored)

    expect(panel[1].isDrawing).toBe(false)
  })

  it('leaves an outline that is still open alone', () => {
    const panel = [panelRoi('1', 'A', false), panelRoi('2', '', true)]
    syncClosedOutlines(panel, roisForDisplay(panel, groups, true, CHANNEL_RGB))
    expect(panel[1].isDrawing).toBe(true)
  })
})

describe('comparisonFromResults', () => {
  const set = (
    groupLabel: string | null,
    roiIds: string[],
    referenceLabel: string | null = null,
    referenceRoiIds: string[] | null = null
  ) => ({ groupLabel, referenceLabel, roiIds, referenceRoiIds })
  const current = (id: string, groupLabel: string | null = null) => ({ id, name: `roi-${id}`, groupLabel })

  it('isGroupedRun is true only when a set covers several ROIs or has a reference group', () => {
    expect(isGroupedRun([])).toBe(false)
    expect(isGroupedRun([set(null, ['1']), set(null, ['2'])])).toBe(false)
    expect(isGroupedRun([set('A', ['1', '2'])])).toBe(true)
    expect(isGroupedRun([set('A', ['1'], 'B')])).toBe(true)
  })

  it('a plain run lists and shows the ROIs that have results, whatever was saved on them afterwards', () => {
    // Saved with the group view on and no groups: every ROI is excluded and unlabelled, but the results remain
    const saved = ['1', '2', '3'].map((id) => ({ ...current(id), includeInDiff: false }))
    const result = comparisonFromResults([set(null, ['2']), set(null, ['1'])], saved)
    expect(result.grouped).toBe(false)
    expect(result.targets).toEqual([
      { id: 1, name: 'roi-1' },
      { id: 2, name: 'roi-2' },
    ])
    // the overlay and the legend show exactly the listed ROIs, each under its own name
    expect(Array.from(result.roiLabels.entries())).toEqual([
      ['1', ''],
      ['2', ''],
    ])
  })

  it('a groups-vs-rest run has one option per group and shows every member under its group', () => {
    const result = comparisonFromResults(
      [set('B', ['3']), set('A', ['2', '1'])],
      [current('1'), current('2'), current('3'), current('4')]
    )
    expect(result.grouped).toBe(true)
    expect(result.targets).toEqual([
      { id: 1, name: 'A' },
      { id: 3, name: 'B' },
    ])
    expect(Array.from(result.roiLabels.entries())).toEqual([
      ['2', 'A'],
      ['1', 'A'],
      ['3', 'B'],
    ])
  })

  it('a two-group run has a single "A vs B" option and shows both groups', () => {
    const result = comparisonFromResults(
      [set('A', ['1', '2'], 'B', ['3'])],
      [current('1', 'A'), current('2', 'A'), current('3', 'B'), current('4')]
    )
    expect(result.grouped).toBe(true)
    expect(result.targets).toEqual([{ id: 1, name: 'A vs B' }])
    expect(Array.from(result.roiLabels.entries())).toEqual([
      ['1', 'A'],
      ['2', 'A'],
      ['3', 'B'],
    ])
  })

  it('a two-group run draws the reference members of the run even after ROIs were relabelled', () => {
    // After the run ROI 3 left group B and ROI 4 joined it: the results are still A (1, 2) vs B (3)
    const result = comparisonFromResults(
      [set('A', ['1', '2'], 'B', ['3'])],
      [current('1', 'A'), current('2', 'A'), current('3', 'C'), current('4', 'B')]
    )
    expect(Array.from(result.roiLabels.entries())).toEqual([
      ['1', 'A'],
      ['2', 'A'],
      ['3', 'B'],
    ])
  })

  it('falls back to the current labels when the reference members were not recorded', () => {
    const result = comparisonFromResults(
      [set('A', ['1', '2'], 'B', null)],
      [current('1', 'A'), current('2', 'A'), current('3', ' B '), current('4')]
    )
    expect(Array.from(result.roiLabels.entries())).toEqual([
      ['1', 'A'],
      ['2', 'A'],
      ['3', 'B'],
    ])
  })

  it('ignores a reference ROI that no longer exists', () => {
    const result = comparisonFromResults(
      [set('A', ['1'], 'B', ['3', '9'])],
      [current('1', 'A'), current('3', 'B'), current('4', 'B')]
    )
    expect(Array.from(result.roiLabels.entries())).toEqual([
      ['1', 'A'],
      ['3', 'B'],
    ])
  })
})
