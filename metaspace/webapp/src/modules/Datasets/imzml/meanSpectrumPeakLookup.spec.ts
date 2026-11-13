import { countPeaksInRange, findPeakIndex, MeanSpectrumPeak } from './meanSpectrumPeakLookup'

const makePeaks = (count: number, spacing: number, start = 1): MeanSpectrumPeak[] =>
  Array.from({ length: count }, (_, i) => [start + i * spacing, 1 + (i % 7), 10 + i])

describe('findPeakIndex', () => {
  const spacing = 10
  const tolerance = spacing / 4

  it('returns the peak under the cursor and -1 between peaks', () => {
    const peaks = makePeaks(8, spacing)

    peaks.forEach(([mz], index) => {
      expect(findPeakIndex(peaks, mz, tolerance)).toBe(index)
    })
    expect(findPeakIndex(peaks, (peaks[0][0] + peaks[1][0]) / 2, tolerance)).toBe(-1)
  })

  it('returns the most intense peak when several are within reach', () => {
    const peaks = makePeaks(8, spacing)
    const index = 3
    const tall: MeanSpectrumPeak = [peaks[index][0] + tolerance / 2, peaks[index][1] * 100, 1]
    peaks.splice(index + 1, 0, tall)

    expect(findPeakIndex(peaks, peaks[index][0], tolerance)).toBe(index + 1)
    expect(findPeakIndex(peaks, peaks[index][0], tolerance / 10)).toBe(index)
  })

  it('ignores peaks that fail the hit test', () => {
    const peaks = makePeaks(8, spacing)
    const index = 3

    expect(findPeakIndex(peaks, peaks[index][0], tolerance, () => false)).toBe(-1)
    expect(findPeakIndex(peaks, peaks[index][0], tolerance, (peak) => peak === peaks[index])).toBe(index)
  })

  it('resolves peaks by position in a large spectrum', () => {
    const peaks = makePeaks(20000, 0.035, 250)

    for (let index = 0; index < peaks.length; index += 997) {
      expect(findPeakIndex(peaks, peaks[index][0], 0.005)).toBe(index)
    }
    expect(findPeakIndex(peaks, peaks[peaks.length - 1][0], 0.005)).toBe(peaks.length - 1)
  })
})

describe('countPeaksInRange', () => {
  it('counts the peaks inside the visible m/z range', () => {
    const peaks = makePeaks(100, 2)

    expect(countPeaksInRange(peaks, peaks[10][0], peaks[20][0])).toBe(10)
    expect(countPeaksInRange(peaks, peaks[0][0] - 1, peaks[99][0] + 1)).toBe(100)
    expect(countPeaksInRange(peaks, peaks[99][0] + 1, peaks[0][0] - 1)).toBe(0)
    expect(countPeaksInRange([], 0, 1)).toBe(0)
  })
})
