import { mount } from '@vue/test-utils'
import Vue from 'vue'
import { range } from 'lodash-es'

import IonImageViewer from './IonImageViewer'
import * as _ionImageRendering from '../lib/ionImageRendering'
import createColormap from '../lib/createColormap'
import safeJsonParse from '../lib/safeJsonParse'

jest.mock('../lib/ionImageRendering')
const mockIonImageRendering = _ionImageRendering as jest.Mocked<typeof _ionImageRendering>

const W = 200
const H = 300

const testHarness = Vue.extend({
  components: {
    IonImageViewer,
  },
  render(h) {
    return h(IonImageViewer, { props: this.$attrs })
  },
})

describe('IonImageViewer', () => {
  const ionImageData = {
    maxIntensity: 255,
    minIntensity: 0,
    scaleType: undefined,
    width: W,
    height: H,
    mask: new Uint8ClampedArray(new Array(W * H).fill(255)),
    intensityValues: new Float32Array(range(W * H)),
  }

  const propsData = {
    ionImageLayers: [
      {
        ionImage: { ...ionImageData, png: { url: 'http://placebacon.com/200/300' } },
        colorMap: createColormap('red'),
      },
      {
        ionImage: { ...ionImageData, png: { url: 'http://placekitten.com/200/300' } },
        colorMap: createColormap('green'),
      },
    ],
    width: W,
    height: H,
    zoom: 1,
    xOffset: 0,
    yOffset: 0,
    showPixelIntensity: true,
  }

  mockIonImageRendering.renderIonImages.mockImplementation(
    (layers: any, canvas: any) => {
      if (canvas) {
        canvas.setAttribute('data-images', layers.map((_: any) => _.ionImage.png.url).join(', '))
      }
      return undefined
    },
  )

  beforeEach(() => {
    // Set HTMLElements to have non-zero dimensions
    // @ts-ignore
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() =>
      ({ left: 200, right: 200 + W, top: 100, bottom: 100 + H, width: W, height: H }))
    jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => W)
    jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => H)
  })

  it('should match snapshot', async() => {
    const wrapper = mount(testHarness, { propsData })
    await Vue.nextTick()

    expect(wrapper.element).toMatchSnapshot()
  })

  it('should match snapshot (with channels tooltip)', async() => {
    const wrapper = mount(testHarness, { propsData })
    await Vue.nextTick()

    // Trigger mouseover to show the intensity popup.
    wrapper.find('div>div').trigger('mousemove', {
      clientX: 250,
      clientY: 150,
    })
    await Vue.nextTick()

    expect(wrapper.element).toMatchSnapshot()
  })

  it('should match snapshot (with normalization)', async() => {
    const wrapper = mount(testHarness, {
      propsData: {
        ...propsData,
        showNormalizedIntensity: true,
        normalizationData: {
          data: new Float32Array(range(W * H)),
          shape: [W, H],
          metadata: {},
          type: 'TIC',
          error: false,
        },
      },
    })
    await Vue.nextTick()

    // Trigger mouseover to show the intensity popup.
    wrapper.find('[data-test-key="ion-image-panel"] div').trigger('mousemove', {
      clientX: 250,
      clientY: 150,
    })
    await Vue.nextTick()

    expect(wrapper.element).toMatchSnapshot()
  })
})
