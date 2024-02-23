import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { vi } from 'vitest'
import IonImageViewer from './IonImageViewer'
import * as _ionImageRendering from '../lib/ionImageRendering'
import { range } from 'lodash-es'
import createColormap from '../lib/createColormap'
import store from '../store'
import router from '../router'
import ElementPlus from 'element-plus'

vi.mock('../lib/ionImageRendering')
// @ts-ignore
const mockIonImageRendering = _ionImageRendering as vi.Mocked<typeof _ionImageRendering>

const W = 200
const H = 300

// Create a test harness component
const TestHarness = defineComponent({
  components: {
    IonImageViewer,
  },
  props: [
    'ionImageLayers',
    'width',
    'height',
    'zoom',
    'xOffset',
    'yOffset',
    'showPixelIntensity',
    'showNormalizedIntensity',
    'normalizationData',
  ],
  setup(props) {
    return () => h(IonImageViewer, { ...props })
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

  mockIonImageRendering.renderIonImages.mockImplementation((layers: any, canvas: any) => {
    if (canvas) {
      canvas.setAttribute('data-images', layers.map((_: any) => _.ionImage.png.url).join(', '))
    }
    return undefined
  })

  beforeEach(() => {
    // Set HTMLElements to have non-zero dimensions
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() =>
      // @ts-ignore
      ({ left: 200, right: 200 + W, top: 100, bottom: 100 + H, width: W, height: H })
    )
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => W)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => H)
  })

  it('should match snapshot', async () => {
    const wrapper = mount(TestHarness, { props: propsData })
    await nextTick()
    expect(wrapper.element).toMatchSnapshot()
  })

  it('should match snapshot (with channels tooltip)', async () => {
    const wrapper = mount(TestHarness, { propsData })
    await nextTick()

    // Trigger mouseover to show the intensity popup.
    wrapper.find('div>div').trigger('mousemove', {
      clientX: 250,
      clientY: 150,
    })
    await nextTick()

    expect(wrapper.element).toMatchSnapshot()
  })

  it('should match snapshot (with normalization)', async () => {
    const wrapper = mount(TestHarness, {
      plugins: [store, router, ElementPlus],
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
    await nextTick()

    // Trigger mouseover to show the intensity popup.
    wrapper.find('[data-test-key="ion-image-panel"] div').trigger('mousemove', {
      clientX: 250,
      clientY: 150,
    })
    await nextTick()

    expect(wrapper.html()).toMatchSnapshot()
  })
})
