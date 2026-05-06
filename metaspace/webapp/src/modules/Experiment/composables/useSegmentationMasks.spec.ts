import { describe, it, expect, vi } from 'vitest'
import { buildSegmentationMasks, decodeLabelMapNpy } from './useSegmentationMasks'

/** Build a tiny v1 NPY buffer for a uint8 array with given values + shape. */
const makeNpyU8 = (values: number[], shape: [number, number]): ArrayBuffer => {
  const header = `{'descr': '|u1', 'fortran_order': False, 'shape': (${shape[0]}, ${shape[1]}), }`
  let padded = header + ' '
  while ((10 + padded.length + 1) % 16 !== 0) padded += ' '
  padded += '\n'
  const headerBytes = new TextEncoder().encode(padded)
  const total = 10 + headerBytes.length + values.length
  const buf = new ArrayBuffer(total)
  const u8 = new Uint8Array(buf)
  u8[0] = 0x93
  u8[1] = 'N'.charCodeAt(0)
  u8[2] = 'U'.charCodeAt(0)
  u8[3] = 'M'.charCodeAt(0)
  u8[4] = 'P'.charCodeAt(0)
  u8[5] = 'Y'.charCodeAt(0)
  u8[6] = 1
  u8[7] = 0
  new DataView(buf).setUint16(8, headerBytes.length, true)
  u8.set(headerBytes, 10)
  u8.set(new Uint8Array(values), 10 + headerBytes.length)
  return buf
}

describe('decodeLabelMapNpy', () => {
  it('parses a u1 NPY array', () => {
    const buffer = makeNpyU8([0, 1, 1, 0], [2, 2])
    const out = decodeLabelMapNpy(buffer)
    expect(out.width).toBe(2)
    expect(out.height).toBe(2)
    expect(Array.from(out.data)).toEqual([0, 1, 1, 0])
  })
})

describe('buildSegmentationMasks', () => {
  it('resolves to a Record keyed by segmentationId', async () => {
    // jsdom lacks a real canvas implementation; stub getContext + toDataURL so we
    // can verify the orchestration logic (fetch -> decode -> per-seg mask) without
    // depending on pixel-level rendering.
    const fakeCtx = {
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      putImageData: vi.fn(),
      drawImage: vi.fn(),
    }
    const origCreate = document.createElement.bind(document)
    const spy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag)
      if (tag === 'canvas') {
        ;(el as any).getContext = () => fakeCtx
        ;(el as any).toDataURL = () => 'data:image/png;base64,FAKE'
      }
      return el
    })

    const buffer = makeNpyU8([0, 1, 1, 0], [2, 2])
    const fetchImpl = (() =>
      Promise.resolve({
        ok: true,
        statusText: 'OK',
        arrayBuffer: () => Promise.resolve(buffer),
      })) as unknown as typeof fetch

    const masks = await buildSegmentationMasks({
      labelMapUrl: '/fake.npy',
      segmentations: [
        { id: 'seg-a', segmentIndex: 0 },
        { id: 'seg-b', segmentIndex: 1 },
      ],
      colorBySegmentationId: { 'seg-a': '#ff0000', 'seg-b': '#00ff00' },
      fetchImpl,
    })

    expect(Object.keys(masks).sort()).toEqual(['seg-a', 'seg-b'])
    for (const v of Object.values(masks)) expect(v).toMatch(/^data:image\/png/)
    spy.mockRestore()
  })

  it('skips segmentations without a color', async () => {
    const fakeCtx = {
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      putImageData: vi.fn(),
      drawImage: vi.fn(),
    }
    const origCreate = document.createElement.bind(document)
    const spy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag)
      if (tag === 'canvas') {
        ;(el as any).getContext = () => fakeCtx
        ;(el as any).toDataURL = () => 'data:image/png;base64,FAKE'
      }
      return el
    })

    const buffer = makeNpyU8([0, 1], [1, 2])
    const fetchImpl = (() =>
      Promise.resolve({
        ok: true,
        statusText: 'OK',
        arrayBuffer: () => Promise.resolve(buffer),
      })) as unknown as typeof fetch

    const masks = await buildSegmentationMasks({
      labelMapUrl: '/fake.npy',
      segmentations: [
        { id: 'seg-a', segmentIndex: 0 },
        { id: 'seg-b', segmentIndex: 1 },
      ],
      colorBySegmentationId: { 'seg-a': '#ff0000' },
      fetchImpl,
    })

    expect(Object.keys(masks)).toEqual(['seg-a'])
    spy.mockRestore()
  })
})
