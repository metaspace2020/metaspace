export type MeanSpectrumPeak = [number, number, number]

const lowerBound = (peaks: MeanSpectrumPeak[], value: number): number => {
  let lo = 0
  let hi = peaks.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (peaks[mid][0] < value) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }
  return lo
}

export const findPeakIndex = (
  peaks: MeanSpectrumPeak[],
  mz: number,
  tolerance: number,
  isHit: (peak: MeanSpectrumPeak) => boolean = () => true
): number => {
  const high = mz + tolerance

  let best = -1
  for (let i = lowerBound(peaks, mz - tolerance); i < peaks.length && peaks[i][0] <= high; i++) {
    if (isHit(peaks[i]) && (best === -1 || peaks[i][1] > peaks[best][1])) {
      best = i
    }
  }
  return best
}

export const countPeaksInRange = (peaks: MeanSpectrumPeak[], low: number, high: number): number =>
  Math.max(0, lowerBound(peaks, high) - lowerBound(peaks, low))

export const formatPeakTooltip = (peak: MeanSpectrumPeak, statLabel: string): string => {
  const [mz, intensity, support] = peak
  return `m/z: ${mz.toFixed(4)}<br>${statLabel}: ${intensity.toExponential(3)}<br>Pixels: ${support}`
}
