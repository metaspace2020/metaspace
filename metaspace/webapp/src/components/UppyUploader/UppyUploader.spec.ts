import { mount } from '@vue/test-utils'
import Uppy from '@uppy/core'
import UppyUploader from './UppyUploader.vue'

const props = {
  requiredFileTypes: ['imzML', 'ibd'],
  options: { restrictions: { allowedFileTypes: ['.imzML', '.ibd'] } },
}

describe('UppyUploader', () => {
  it('classic (default) variant renders one FileStatus per required type in a single dropzone', () => {
    const w = mount(UppyUploader, { props })
    expect(w.findAllComponents({ name: 'FileStatus' })).toHaveLength(2)
    expect(w.findAllComponents({ name: 'FileSlot' })).toHaveLength(0)
    expect(w.findAllComponents({ name: 'Dropzone' })).toHaveLength(1)
    expect(w.find('.sm-uppy-slots').exists()).toBe(false)
    expect(w.text().replace(/\s+/g, ' ')).toContain('.imzML file')
    expect(w.text()).toContain('required')
  })

  it('slots variant renders a FileSlot per required type inside one dropzone', () => {
    const w = mount(UppyUploader, { props: { ...props, variant: 'slots' } })
    const dropzones = w.findAllComponents({ name: 'Dropzone' })
    expect(dropzones).toHaveLength(1)
    expect(dropzones[0].classes()).toContain('sm-uppy-slots')
    const slots = w.findAllComponents({ name: 'FileSlot' })
    expect(slots.map((s) => s.props('extension'))).toEqual(['imzML', 'ibd'])
    expect(slots.every((s) => s.props('status') === 'EMPTY')).toBe(true)
    expect(w.findAllComponents({ name: 'FileStatus' })).toHaveLength(0)
  })

  it('slots variant: browse opens the file picker of the shared dropzone', async () => {
    const w = mount(UppyUploader, { props: { ...props, variant: 'slots' }, attachTo: document.body })
    const input = w.find('input[type="file"]').element as HTMLInputElement
    const click = vi.spyOn(input, 'click').mockImplementation(() => undefined)
    w.findAllComponents({ name: 'FileSlot' })[1].vm.$emit('browse')
    await new Promise((r) => setTimeout(r))
    expect(click).toHaveBeenCalledTimes(1)
    w.unmount()
  })

  it('slots variant: dropped files land in their slot and are emitted as file-added', async () => {
    const w = mount(UppyUploader, { props: { ...props, variant: 'slots' } })
    const file = new File(['abc'], 'sample.imzML', { type: '' })
    w.findComponent({ name: 'Dropzone' }).vm.$emit('upload', [file])
    await w.vm.$nextTick()
    expect(w.emitted('file-added')).toHaveLength(1)
    const [imzml, ibd] = w.findAllComponents({ name: 'FileSlot' })
    expect(imzml.props('name')).toBe('sample.imzML')
    expect(imzml.props('size')).toBe(3)
    expect(ibd.props('status')).toBe('EMPTY')
  })

  it('slots variant: with minNumberOfFiles 2 one file waits for its pair without calling upload()', async () => {
    const upload = vi.spyOn(Uppy.prototype, 'upload').mockResolvedValue(undefined)
    const options = { restrictions: { ...props.options.restrictions, minNumberOfFiles: 2, maxNumberOfFiles: 2 } }
    const w = mount(UppyUploader, { props: { ...props, options, variant: 'slots' } })
    const dropzone = w.findComponent({ name: 'Dropzone' })
    dropzone.vm.$emit('upload', [new File(['abc'], 'sample.imzML')])
    await w.vm.$nextTick()
    expect(upload).not.toHaveBeenCalled()
    const [imzml, ibd] = w.findAllComponents({ name: 'FileSlot' })
    expect(imzml.props('status')).toBe('PENDING')
    expect(imzml.props('waitingFor')).toBe('ibd')
    expect(ibd.props('waitingFor')).toBeUndefined()
    const changes = w.emitted('files-changed')!
    expect(changes[changes.length - 1][0]).toEqual([
      { extension: 'imzML', status: 'PENDING' },
      { extension: 'ibd', status: 'EMPTY' },
    ])

    dropzone.vm.$emit('upload', [new File(['abcd'], 'sample.ibd')])
    await w.vm.$nextTick()
    expect(upload).toHaveBeenCalledTimes(1)
    upload.mockRestore()
  })

  it('slots variant: Replace removes the file flagged as a replacement and opens the picker', async () => {
    const w = mount(UppyUploader, { props: { ...props, variant: 'slots' }, attachTo: document.body })
    const input = w.find('input[type="file"]').element as HTMLInputElement
    const click = vi.spyOn(input, 'click').mockImplementation(() => undefined)
    w.findComponent({ name: 'Dropzone' }).vm.$emit('upload', [new File(['abc'], 'sample.imzML')])
    // let Uppy's upload() promise chain settle before removing (a real removal is never this fast)
    await new Promise((r) => setTimeout(r))

    w.findAllComponents({ name: 'FileSlot' })[0].vm.$emit('replace')
    await new Promise((r) => setTimeout(r))
    const removed = w.emitted('file-removed')!
    expect(removed).toHaveLength(1)
    expect((removed[0][0] as { name: string }).name).toBe('sample.imzML')
    expect(removed[0][1]).toEqual({ replacing: true })
    expect(click).toHaveBeenCalledTimes(1)
    expect(w.findAllComponents({ name: 'FileSlot' })[0].props('status')).toBe('EMPTY')

    // a plain remove carries no flag
    w.findComponent({ name: 'Dropzone' }).vm.$emit('upload', [new File(['abc'], 'other.imzML')])
    await new Promise((r) => setTimeout(r))
    w.findAllComponents({ name: 'FileSlot' })[0].vm.$emit('remove')
    expect(w.emitted('file-removed')![1]).toHaveLength(1)
    w.unmount()
  })

  it('re-enables the dropzone when an upload batch completes, and reports per-type status', async () => {
    const handlers: Record<string, (...args: unknown[]) => void> = {}
    const on = Uppy.prototype.on
    const spy = vi.spyOn(Uppy.prototype, 'on').mockImplementation(function (this: Uppy, event: any, cb: any) {
      handlers[event] = cb
      return on.call(this, event, cb)
    })
    const w = mount(UppyUploader, { props: { ...props, variant: 'slots' } })
    spy.mockRestore()
    const dropzone = () => w.findComponent({ name: 'Dropzone' })
    expect(dropzone().props('disabled')).toBe(false)

    handlers.upload()
    await w.vm.$nextTick()
    expect(dropzone().props('disabled')).toBe(true)
    expect(w.emitted('upload')).toHaveLength(1)

    handlers.complete({ successful: [], failed: [] })
    await w.vm.$nextTick()
    expect(dropzone().props('disabled')).toBe(false)
    expect(w.emitted('complete')).toHaveLength(1)

    const changes = w.emitted('files-changed')!
    expect(changes[changes.length - 1][0]).toEqual([
      { extension: 'imzML', status: 'EMPTY' },
      { extension: 'ibd', status: 'EMPTY' },
    ])
  })

  it('classic variant does not emit files-changed', () => {
    const w = mount(UppyUploader, { props })
    expect(w.emitted('files-changed')).toBeUndefined()
  })
})
