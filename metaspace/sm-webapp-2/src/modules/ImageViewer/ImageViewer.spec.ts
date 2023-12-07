import { mount } from '@vue/test-utils'
import Vue from 'vue'
import Vuex from 'vuex'
import { sync } from 'vuex-router-sync'

import store from '../../store'
import router from '../../router'
import * as _ionImageRendering from '../../lib/ionImageRendering'

import ImageViewer from './ImageViewer.vue'
import { useIonImageMenu } from './ionImageState'
import viewerState, { toggleMode } from './state'

Vue.use(Vuex)
sync(store, router)

jest.mock('../../lib/ionImageRendering')
const mockIonImageRendering = _ionImageRendering as jest.Mocked<typeof _ionImageRendering>

// const mockImage = {
//   ctype: 4,
//   data: new Uint8Array([
//     13, 204, 255, 255, 0, 0, 255, 255, 3, 33, 255, 255, 95, 237, 255, 255, 103, 102, 255,
//     255, 255, 255, 255, 255, 148, 77, 255, 255, 182, 80, 255, 255, 182, 80, 255, 255,
//   ]),
//   depth: 16,
//   frames: [],
//   height: 4,
//   tabs: {},
//   width: 2,
// }

describe('ImageViewer', () => {
  mockIonImageRendering.loadPngFromUrl.mockImplementation(() => Promise.resolve({} as any))
  mockIonImageRendering.processIonImage.mockImplementation(() => ({
    intensityValues: new Float32Array(),
    clippedValues: new Uint8ClampedArray(),
    mask: new Uint8ClampedArray(),
    width: 2,
    height: 4,
    minIntensity: 0,
    maxIntensity: 1,
    clippedMinIntensity: 0,
    clippedMaxIntensity: 1,
    scaledMinIntensity: 0,
    scaledMaxIntensity: 1,
    userMinIntensity: 0,
    userMaxIntensity: 1,
    scaleBarValues: new Uint8ClampedArray(),
    lowQuantile: 0,
    highQuantile: 1,
  }))

  const mockAnnotationData = {
    ion: 'H2O',
    isotopeImages: [{ url: 'fake://url' }],
    possibleCompounds: [
      { name: 'water' },
    ],
  }
  const annotation1 = { ...mockAnnotationData, id: '1' }
  const annotation2 = { ...mockAnnotationData, id: '2' }

  const propsData = {
    annotation: annotation1,
    colormap: 'Viridis',
    opacity: 1,
    imageLoaderSettings: {
      imagePosition: {
        xOffset: 0,
        yOffset: 0,
        zoom: 1,
      },
      pixelAspectRatio: 1,
    },
    applyImageMove: () => {},
  }

  beforeEach(async() => {
    viewerState.mode.value = 'SINGLE'
  })

  it('should initialise with one layer', async() => {
    const wrapper = mount(ImageViewer, { store, router, propsData })
    await Vue.nextTick()

    expect(wrapper.vm.$data.ionImageLayers.length).toBe(1)
  })

  it('should switch layers', async() => {
    const wrapper = mount(ImageViewer, { store, router, propsData })
    await Vue.nextTick()

    expect(wrapper.vm.$data.ionImageMenuItems.length).toBe(1)
    expect(wrapper.vm.$data.ionImageMenuItems[0].id).toBe(annotation1.id)

    wrapper.setProps({ annotation: annotation2 })
    await Vue.nextTick()

    expect(wrapper.vm.$data.ionImageMenuItems.length).toBe(1)
    expect(wrapper.vm.$data.ionImageMenuItems[0].id).toBe(annotation2.id)
  })

  it('should add layers', async() => {
    const wrapper = mount(ImageViewer, { store, router, propsData })
    await Vue.nextTick()

    toggleMode()
    const { setActiveLayer } = useIonImageMenu()
    setActiveLayer(null)

    wrapper.setProps({ annotation: annotation2 })
    await Vue.nextTick()

    expect(wrapper.vm.$data.ionImageLayers.length).toBe(2)
  })

  it('should hide layers', async() => {
    const wrapper = mount(ImageViewer, { store, router, propsData })
    await Vue.nextTick()

    toggleMode()
    const { setActiveLayer } = useIonImageMenu()
    setActiveLayer(null)

    wrapper.setProps({ annotation: annotation2 })
    await Vue.nextTick()

    expect(wrapper.vm.$data.ionImageLayers.length).toBe(2)

    wrapper.vm.$data.ionImageMenuItems[0].settings.visible = false
    expect(wrapper.vm.$data.ionImageLayers.length).toBe(1)
  })

  it('should retain channels when toggling mode', async() => {
    const wrapper = mount(ImageViewer, { store, router, propsData })
    await Vue.nextTick()

    toggleMode()
    const { setActiveLayer } = useIonImageMenu()
    setActiveLayer(null)

    wrapper.setProps({ annotation: annotation2 })
    await Vue.nextTick()
    expect(wrapper.vm.$data.ionImageMenuItems.length).toBe(2)

    toggleMode()
    expect(wrapper.vm.$data.mode === 'SINGLE')
    toggleMode()
    expect(wrapper.vm.$data.mode === 'MULTI')

    expect(wrapper.vm.$data.ionImageMenuItems.length).toBe(2)
  })

  it('should reset channels if annotation is changed in single mode', async() => {
    const wrapper = mount(ImageViewer, { store, router, propsData })
    await Vue.nextTick()

    toggleMode()
    const { setActiveLayer } = useIonImageMenu()
    setActiveLayer(null)

    wrapper.setProps({ annotation: annotation2 })
    await Vue.nextTick()
    expect(wrapper.vm.$data.ionImageLayers.length).toBe(2)

    toggleMode()
    expect(wrapper.vm.$data.mode === 'SINGLE')

    wrapper.setProps({ annotation: annotation1 })
    expect(wrapper.vm.$data.ionImageMenuItems.length).toBe(1)
  })

  it('should reset channels if dataset filter is removed', async() => {
    router.replace({ path: '/annotations?ds=1' })
    await Vue.nextTick()
    expect(store.getters.filter.datasetIds).toEqual(['1'])

    const wrapper = mount(ImageViewer, { store, router, propsData })
    await Vue.nextTick()

    toggleMode()
    const { setActiveLayer } = useIonImageMenu()
    setActiveLayer(null)

    wrapper.setProps({ annotation: annotation2 })
    await Vue.nextTick()
    expect(wrapper.vm.$data.ionImageMenuItems.length).toBe(2)

    store.commit('updateFilter', {
      datasetIds: [],
    })
    await Vue.nextTick()

    expect(wrapper.vm.$data.ionImageMenuItems.length).toBe(1)
    expect(wrapper.vm.$data.ionImageMenuItems[0].id).toBe(annotation2.id)
  })
})
