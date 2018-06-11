import * as d3 from 'd3';
import * as scales from 'plotly.js/src/components/colorscale/scales.js';
import * as extractScale from 'plotly.js/src/components/colorscale/extract_scale.js';

interface ColorScale {
  domain: number[]
  range: d3.RGBColor[]
}

export default function getColorScale(name: string): ColorScale {
  if (name[0] != '-')
    return extractScale(scales[name], 0, 1); // normal
  else
    return extractScale(scales[name.slice(1)], 1, 0); // inverted
}

