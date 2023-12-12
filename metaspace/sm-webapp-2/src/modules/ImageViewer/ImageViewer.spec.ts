import {flushPromises, mount} from '@vue/test-utils';
import { vi} from 'vitest';
import {nextTick} from 'vue';

import ImageViewer from './ImageViewer.vue';
import viewerState, { toggleMode } from './state';
import * as _ionImageRendering from '../../lib/ionImageRendering';
import router from "../../router";
import {useIonImageMenu} from "./ionImageState";
import {createStore} from "vuex";

// Mocking ionImageRendering
vi.mock('../../lib/ionImageRendering');
const mockIonImageRendering = vi.mocked(_ionImageRendering);

// Mocking FileSaver
vi.mock('file-saver');

const W = 200;
const H = 300;

let store : any;

describe('ImageViewer', () => {
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


  beforeEach(() => {
    vi.clearAllMocks();
    store = createStore({
      state: {
        datasetIds: ['1']
      },
      getters: {
        filter:  (state) => ({
          datasetIds:  state.datasetIds
        })
      },
      mutations: {
        updateFilter: (state, filter) => {
          state.datasetIds = filter.datasetIds
        }
      }
    });


    // Set HTMLElements to have non-zero dimensions
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => // @ts-ignore
      ({ left: 200, right: 200 + W, top: 100, bottom: 100 + H, width: W, height: H }));
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => W);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => H);

    viewerState.mode.value = 'SINGLE';
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

  });


  it('should initialise with one layer', async () => {
    const wrapper = mount(ImageViewer, {
      global: {
        plugins: [store, router]
      },
      props: propsData
    });
    await flushPromises()
    await nextTick();

    expect(wrapper.vm.ionImageLayers.length).toBe(1);
  });


  it('should switch layers', async() => {
    const wrapper : any = mount(ImageViewer, {
      global: {
        plugins: [store, router]
      },
      props: propsData
    });
    await flushPromises()
    await nextTick()

    expect(wrapper.vm.ionImageMenuItems.length).toBe(1)
    expect(wrapper.vm.ionImageMenuItems[0].id).toBe(annotation1.id)

    wrapper.setProps({ annotation: annotation2 })
    await flushPromises()
    await nextTick()

    expect(wrapper.vm.ionImageMenuItems.length).toBe(1)
    expect(wrapper.vm.ionImageMenuItems[0].id).toBe(annotation2.id)
  })

  it('should add layers', async() => {
    const wrapper : any = mount(ImageViewer, {
      global: {
        plugins: [store, router]
      },
      props: propsData
    });

    await flushPromises()
    await nextTick()

    toggleMode()
    const { setActiveLayer } = useIonImageMenu()
    setActiveLayer(null)

    wrapper.setProps({ annotation: annotation2 })

    await flushPromises()
    await nextTick()

    expect(wrapper.vm.ionImageLayers.length).toBe(2)
  })


  it('should hide layers', async() => {
    const wrapper : any = mount(ImageViewer, {
      global: {
        plugins: [store, router]
      },
      props: propsData
    });

    await flushPromises()
    await nextTick()

    toggleMode()
    const { setActiveLayer } = useIonImageMenu()
    setActiveLayer(null)

    wrapper.setProps({ annotation: annotation2 })
    await nextTick()

    expect(wrapper.vm.ionImageLayers.length).toBe(2)

    wrapper.vm.ionImageMenuItems[0].settings.visible = false
    expect(wrapper.vm.ionImageLayers.length).toBe(1)
  })

  it('should retain channels when toggling mode', async() => {
    const wrapper : any = mount(ImageViewer, {
      global: {
        plugins: [store, router]
      },
      props: propsData
    });

    await flushPromises()
    await nextTick()

    toggleMode()
    const { setActiveLayer } = useIonImageMenu()
    setActiveLayer(null)

    wrapper.setProps({ annotation: annotation2 })

    await flushPromises()
    await nextTick()

    expect(wrapper.vm.ionImageMenuItems.length).toBe(2)

    toggleMode()
    expect(wrapper.vm.mode === 'SINGLE')
    toggleMode()
    expect(wrapper.vm.mode === 'MULTI')

    expect(wrapper.vm.ionImageMenuItems.length).toBe(2)
  })

  it('should reset channels if annotation is changed in single mode', async() => {
    const wrapper : any = mount(ImageViewer, {
      global: {
        plugins: [store, router]
      },
      props: propsData
    });

    await flushPromises()
    await nextTick()

    toggleMode()
    const { setActiveLayer } = useIonImageMenu()
    setActiveLayer(null)

    wrapper.setProps({ annotation: annotation2 })

    await flushPromises()
    await nextTick()

    expect(wrapper.vm.ionImageLayers.length).toBe(2)

    toggleMode()
    expect(wrapper.vm.mode === 'SINGLE')

    wrapper.setProps({ annotation: annotation1 })
    expect(wrapper.vm.ionImageMenuItems.length).toBe(1)
  })

  it('should reset channels if dataset filter is removed', async() => {
    await router.replace({ path: '/annotations?ds=1' })
    await flushPromises()
    await nextTick()

    expect(store.getters.filter.datasetIds).toEqual(['1'])

    const wrapper : any = mount(ImageViewer, {
      global: {
        plugins: [store, router]
      },
      props: propsData
    });

    await flushPromises()
    await nextTick()

    toggleMode()
    const { setActiveLayer } = useIonImageMenu()
    setActiveLayer(null)

    wrapper.setProps({ annotation: annotation2 })

    await flushPromises()
    await nextTick()

    expect(wrapper.vm.ionImageMenuItems.length).toBe(2)

    await store.commit('updateFilter', {
      datasetIds: [],
    })

    await flushPromises()
    await nextTick()

    expect(wrapper.vm.ionImageMenuItems.length).toBe(1)
    expect(wrapper.vm.ionImageMenuItems[0].id).toBe(annotation2.id)
  })
});
