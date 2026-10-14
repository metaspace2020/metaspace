export type MeanSpectrumPeak = [number, number, number]

export const findPeakIndex = (peaks: MeanSpectrumPeak[], mz: number, tolerance: number): number => {
  const low = mz - tolerance
  const high = mz + tolerance

  let lo = 0
  let hi = peaks.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (peaks[mid][0] < low) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }

  let best = -1
  for (let i = lo; i < peaks.length && peaks[i][0] <= high; i++) {
    if (best === -1 || peaks[i][1] > peaks[best][1]) {
      best = i
    }
  }
  return best
}

export const formatPeakTooltip = (peak: MeanSpectrumPeak, statLabel: string): string => {
  const [mz, intensity, support] = peak
  return `m/z: ${mz.toFixed(4)}<br>${statLabel}: ${intensity.toExponential(3)}<br>Pixels: ${support}`
}
