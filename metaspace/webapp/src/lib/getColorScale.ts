import { reverse } from 'lodash-es'

interface ColorScale {
  domain: number[]
  range: string[]
}

/**
 * This "scales" variable is derived from "src/components/colorscale/scales.js" in plotly.js@1.34.0.
 * The following copyright and license information applies for the contents of this variable:
 *
 * Copyright 2012-2018, Plotly, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
const scales: Record<string, ColorScale> = {
  Viridis: {
    domain: [
      0,
      0.06274509803921569,
      0.12549019607843137,
      0.18823529411764706,
      0.25098039215686274,
      0.3137254901960784,
      0.3764705882352941,
      0.4392156862745098,
      0.5019607843137255,
      0.5647058823529412,
      0.6274509803921569,
      0.6901960784313725,
      0.7529411764705882,
      0.8156862745098039,
      0.8784313725490196,
      0.9411764705882353,
      1,
    ],
    range: [
      '#440154',
      '#48186a',
      '#472d7b',
      '#424086',
      '#3b528b',
      '#33638d',
      '#2c728e',
      '#26828e',
      '#21918c',
      '#1fa088',
      '#28ae80',
      '#3fbc73',
      '#5ec962',
      '#84d44b',
      '#addc30',
      '#d8e219',
      '#fde725',
    ],
  },
  Cividis: {
    domain: [
      0,
      0.058824,
      0.117647,
      0.176471,
      0.235294,
      0.294118,
      0.352941,
      0.411765,
      0.470588,
      0.529412,
      0.588235,
      0.647059,
      0.705882,
      0.764706,
      0.823529,
      0.882353,
      0.941176,
      1,
    ],
    range: [
      'rgb(0,32,76)',
      'rgb(0,42,102)',
      'rgb(0,52,110)',
      'rgb(39,63,108)',
      'rgb(60,74,107)',
      'rgb(76,85,107)',
      'rgb(91,95,109)',
      'rgb(104,106,112)',
      'rgb(117,117,117)',
      'rgb(131,129,120)',
      'rgb(146,140,120)',
      'rgb(161,152,118)',
      'rgb(176,165,114)',
      'rgb(192,177,109)',
      'rgb(209,191,102)',
      'rgb(225,204,92)',
      'rgb(243,219,79)',
      'rgb(255,233,69)',
    ],
  },
  Hot: {
    domain: [
      0,
      0.3,
      0.6,
      1,
    ],
    range: [
      'rgb(0,0,0)',
      'rgb(230,0,0)',
      'rgb(255,210,0)',
      'rgb(255,255,255)',
    ],
  },
  YlGnBu: {
    domain: [
      0,
      0.125,
      0.25,
      0.375,
      0.5,
      0.625,
      0.75,
      0.875,
      1,
    ],
    range: [
      'rgb(8,29,88)',
      'rgb(37,52,148)',
      'rgb(34,94,168)',
      'rgb(29,145,192)',
      'rgb(65,182,196)',
      'rgb(127,205,187)',
      'rgb(199,233,180)',
      'rgb(237,248,217)',
      'rgb(255,255,217)',
    ],
  },
  Portland: {
    domain: [
      0,
      0.25,
      0.5,
      0.75,
      1,
    ],
    range: [
      'rgb(12,51,131)',
      'rgb(10,136,186)',
      'rgb(242,211,56)',
      'rgb(242,143,56)',
      'rgb(217,30,30)',
    ],
  },
  Greys: {
    domain: [
      0,
      1,
    ],
    range: [
      'rgb(0,0,0)',
      'rgb(255,255,255)',
    ],
  },
}

export default function getColorScale(name: string): ColorScale {
  if (name[0] !== '-') {
    return scales[name]
  } else {
    // inverted - reverse both arrays so that the domain is always in ascending order
    const { domain, range } = scales[name.slice(1)]
    return { domain: reverse(domain.map(v => 1 - v)), range: reverse(range) }
  }
}
