import { mount } from '@vue/test-utils'
import FileSlot, { formatBytes } from './FileSlot.vue'

const MB = 1024 * 1024
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

describe('FileSlot', () => {
  it('formats byte sizes with one decimal', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2.4 * MB)).toBe('2.4 MB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(3 * 1024 * MB)).toBe('3.0 GB')
  })

  it('renders an empty .ibd slot with the file-name hint and a browse link', async () => {
    const w = mount(FileSlot, { props: { extension: 'ibd', status: 'EMPTY' } })
    expect(w.classes()).toContain('sm-file-slot--empty')
    expect(norm(w.find('.sm-file-slot__name').text())).toBe('.ibd file *')
    expect(norm(w.find('.sm-file-slot__line').text())).toBe(
      "Drop here or browse · must share the imzML's file name (e.g. sample.ibd for sample.imzML)"
    )
    expect(w.findAll('.sm-file-slot__line code').map((c) => c.text())).toEqual(['sample.ibd', 'sample.imzML'])
    expect(w.find('.sm-file-slot__line').text()).not.toContain('`')
    expect(w.find('.sm-file-slot__replace').exists()).toBe(false)
    await w.find('.sm-file-slot__browse').trigger('click')
    expect(w.emitted('browse')).toHaveLength(1)
  })

  it('renders an empty .imzML slot with its file-name hint', () => {
    const w = mount(FileSlot, { props: { extension: 'imzML', status: 'EMPTY' } })
    expect(norm(w.find('.sm-file-slot__line').text())).toBe(
      'Drop here or browse · must share the ibd file name (e.g. sample.imzML for sample.ibd)'
    )
    expect(w.findAll('.sm-file-slot__line code').map((c) => c.text())).toEqual(['sample.imzML', 'sample.ibd'])
  })

  it('renders a completed file with size and Replace', async () => {
    const w = mount(FileSlot, {
      props: { extension: 'imzML', status: 'COMPLETE', name: 'mouse_intestine.imzML', size: 2.4 * MB, progress: 100 },
    })
    expect(w.classes()).toContain('sm-file-slot--complete')
    expect(norm(w.find('.sm-file-slot__name').text())).toBe('mouse_intestine.imzML')
    expect(norm(w.find('.sm-file-slot__line').text())).toBe('.imzML · 2.4 MB · ✓ uploaded')
    expect(w.findComponent({ name: 'ProgressRing' }).exists()).toBe(false)

    await w.find('.sm-file-slot__replace').trigger('click')
    // one `replace` event: the uploader removes the file (flagged as a replacement) and opens the picker
    expect(w.emitted('replace')).toHaveLength(1)
    expect(w.emitted('remove')).toBeUndefined()
    expect(w.emitted('browse')).toBeUndefined()
  })

  it('a filled slot swallows clicks and keyups; an empty slot lets clicks reach the dropzone', async () => {
    const parentClick = vi.fn()
    const parentKeyup = vi.fn()
    const Host = {
      components: { FileSlot },
      props: ['status', 'name'],
      setup: () => ({ parentClick, parentKeyup }),
      template: `<div @click="parentClick" @keyup="parentKeyup">
        <FileSlot extension="imzML" :status="status" :name="name" />
      </div>`,
    }
    const filled = mount(Host, { props: { status: 'COMPLETE', name: 'a.imzML' } })
    await filled.find('.sm-file-slot').trigger('click')
    await filled.find('.sm-file-slot__replace').trigger('keyup', { key: 'Enter' })
    expect(parentClick).not.toHaveBeenCalled()
    expect(parentKeyup).not.toHaveBeenCalled()

    const empty = mount(Host, { props: { status: 'EMPTY' } })
    await empty.find('.sm-file-slot').trigger('click')
    expect(parentClick).toHaveBeenCalledTimes(1)
    // the browse link opens the picker itself and does not bubble (no double open)
    await empty.find('.sm-file-slot__browse').trigger('click')
    expect(parentClick).toHaveBeenCalledTimes(1)
  })

  it('renders a picked file waiting for its pair like a filled slot, with Replace and a neutral border', async () => {
    const w = mount(FileSlot, {
      props: { extension: 'imzML', status: 'PENDING', name: 'sample.imzML', size: 2.4 * MB, waitingFor: 'ibd' },
    })
    expect(w.classes()).toContain('sm-file-slot--pending')
    expect(norm(w.find('.sm-file-slot__name').text())).toBe('sample.imzML')
    expect(norm(w.find('.sm-file-slot__line').text())).toBe('.imzML · 2.4 MB · waiting for the .ibd file')
    expect(w.findComponent({ name: 'ProgressRing' }).exists()).toBe(false)
    await w.find('.sm-file-slot__replace').trigger('click')
    expect(w.emitted('replace')).toHaveLength(1)
  })

  it('renders an uploading file with progress ring and percentage', () => {
    const w = mount(FileSlot, {
      props: { extension: 'ibd', status: 'UPLOADING', name: 'mouse_intestine.ibd', size: 2.4 * MB, progress: 42 },
    })
    expect(w.classes()).toContain('sm-file-slot--progress')
    expect(norm(w.find('.sm-file-slot__line').text())).toBe('.ibd · 2.4 MB · 42% uploaded')
    expect(w.findComponent({ name: 'ProgressRing' }).exists()).toBe(true)
    expect(w.find('.sm-file-slot__replace').exists()).toBe(false)
  })

  it('renders an error with Retry and emits retry / remove', async () => {
    const w = mount(FileSlot, {
      props: { extension: 'ibd', status: 'ERROR', name: 'mouse_intestine.ibd', size: 2.4 * MB, progress: 10 },
    })
    expect(w.classes()).toContain('sm-file-slot--error')
    expect(norm(w.find('.sm-file-slot__line').text())).toContain('upload failed')
    const retry = w.findAll('.sm-file-slot__action').find((b) => b.text() === 'Retry')!
    await retry.trigger('click')
    expect(w.emitted('retry')).toHaveLength(1)
    await w.find('.sm-file-slot__remove').trigger('click')
    expect(w.emitted('remove')).toHaveLength(1)
  })
})
