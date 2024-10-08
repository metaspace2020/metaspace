import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { vi } from 'vitest'
import ImageLoader from './ImageLoader.vue'
import * as _ionImageRendering from '../lib/ionImageRendering'
import { range } from 'lodash-es'
import { IonImage } from '../lib/ionImageRendering'

vi.mock('../lib/ionImageRendering')
// @ts-ignore
const mockIonImageRendering = _ionImageRendering as vi.Mocked<typeof _ionImageRendering>

const W = 200
const H = 300

describe('ImageLoader', () => {
  const baseProps = {
    src: 'http://placebacon.com/200/300',
    imagePosition: { zoom: 1, xOffset: 0, yOffset: 0 },
    imageStyle: { transform: 'scaleX(1.23)' },
    maxIntensity: 255,
    minIntensity: 0,
    pixelAspectRatio: 1,
    scaleType: undefined,
    colormap: 'Hot',
    imageFitParams: { areaHeight: 250, areaMinHeight: 50 },
    showPixelIntensity: true,
  }
  const fullProps = {
    ...baseProps,
    opticalSrc: 'http://placekitten.com/200/300',
    opacityMode: 'constant',
    opticalTransform: [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ],
    annotImageOpacity: 0.8,
    scrollBlock: true,
    showPixelIntensity: true,
  }

  mockIonImageRendering.loadPngFromUrl.mockImplementation((url) => ({ url }) as any)
  mockIonImageRendering.processIonImage.mockImplementation(
    (png, minIntensity, maxIntensity, scaleType): IonImage =>
      ({
        png,
        minIntensity,
        maxIntensity,
        scaleType,
        width: W,
        height: H,
        mask: new Uint8ClampedArray(new Array(W * H).fill(255)),
        intensityValues: new Float32Array(range(W * H)),
      }) as any
  )
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

  it('should match snapshot (minimal)', async () => {
    const wrapper = mount(ImageLoader, { propsData: baseProps })
    await nextTick()
    expect(wrapper.html()).toMatchSnapshot() // Changed from wrapper.element
  })

  it('should match snapshot (with everything turned on)', async () => {
    const wrapper = mount(ImageLoader, { propsData: fullProps })
    await nextTick()

    // Trigger mouseover to show the intensity popup.
    wrapper.find('div>div').trigger('mousemove', {
      clientX: 250,
      clientY: 150,
    })
    await nextTick()

    expect(wrapper.html()).toMatchSnapshot()
  })
})
