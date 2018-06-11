import * as d3 from 'd3';
import getColorScale from './getColorScale';

export default function createColormap(name: string): number[][] {
  const {domain, range} = getColorScale(name);
  const sclFun = d3.scaleLinear<d3.RGBColor>().domain(domain).range(range).clamp(true);

  let colors = [];
  for (let i = 0; i < 256; i++) {
    const color = d3.rgb(sclFun(i / 255.0));
    colors.push([color.r, color.g, color.b].map(Math.round));
  }
  return colors;
}
