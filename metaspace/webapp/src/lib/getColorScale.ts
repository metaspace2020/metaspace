import * as d3 from 'd3';
import {reverse} from 'lodash-es';
// WORKAROUND: Jest had an issue with these CommonJS exports. `import * as extractScale` sets extractScale
// to a regular function in the browser, but to {default: [Function]} when run in Jest. There doesn't appear to be
// a good framework-level solution, so this horror is needed:
let scales = require('plotly.js/src/components/colorscale/scales.js');
if (scales.default) scales = scales.default;
let extractScale = require('plotly.js/src/components/colorscale/extract_scale.js');
if (extractScale.default) extractScale = extractScale.default;

interface ColorScale {
  domain: number[]
  range: d3.RGBColor[]
}

export default function getColorScale(name: string): ColorScale {
  if (name[0] != '-')
  {
    return extractScale(scales[name], 0, 1); // normal
  }
  else {
    // inverted - reverse both arrays so that the domain is always in ascending order
    const {domain, range} = extractScale(scales[name.slice(1)], 1, 0);
    return {domain: reverse(domain), range: reverse(range)};
  }
}

