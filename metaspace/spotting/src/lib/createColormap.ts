import * as d3 from 'd3'
import getColorScale from './getColorScale'

export type OpacityMode = 'constant' | 'linear' | 'quadratic';

const OPACITY_MAPPINGS: Record<OpacityMode, (x:number) => number> = {
  constant: (x) => 255,
  linear: (x) => x,
  quadratic: (x) => 255 - (255 - x) * (255 - x) / 255,
}

export default function createColormap(name: string, opacityMode: OpacityMode = 'constant',
  opacityScale: number = 1): number[][] {
  const { domain, range } = getColorScale(name)
  const sclFun = d3.scaleLinear<string>().domain(domain).range(range).clamp(true)
  const alphaFunc = OPACITY_MAPPINGS[opacityMode]

  const colors = []
  for (let i = 0; i < 256; i++) {
    const color = d3.rgb(sclFun(i / 255.0))
    const alpha = alphaFunc(i) * opacityScale
    colors.push([color.r, color.g, color.b, alpha].map(Math.round))
  }
  return colors
}
