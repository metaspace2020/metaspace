import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ProSectionNav from './ProSectionNav'

describe('ProSectionNav', () => {
  it('renders the six section links in order', () => {
    const wrapper = mount(ProSectionNav)
    const links = wrapper.findAll('a')
    expect(links.map((a) => a.text())).toEqual(['Analysis', 'Privacy', 'Docs', 'Plans', 'Institutions', 'FAQ'])
  })

  it('targets the anchor of every tab on the page', () => {
    const wrapper = mount(ProSectionNav)
    const hrefs = wrapper.findAll('a').map((a) => a.attributes('href'))
    expect(hrefs).toEqual(['#analysis', '#privacy', '#docs', '#plans', '#procurement', '#faq'])
  })

  it('renders no button - links only', () => {
    const wrapper = mount(ProSectionNav)
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('scrolls to the matching section instead of a hard navigation when its target exists', () => {
    const target = document.createElement('div')
    target.id = 'privacy'
    document.body.appendChild(target)
    const scrollSpy = vi.fn()
    target.scrollIntoView = scrollSpy

    const wrapper = mount(ProSectionNav)
    const link = wrapper.findAll('a').find((a) => a.attributes('href') === '#privacy')!
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true })
    link.element.dispatchEvent(clickEvent)

    expect(scrollSpy).toHaveBeenCalled()
    expect(clickEvent.defaultPrevented).toBe(true)

    document.body.removeChild(target)
  })

  it('is labelled for assistive tech as page-section navigation', () => {
    const wrapper = mount(ProSectionNav)
    expect(wrapper.find('nav').attributes('aria-label')).toBeTruthy()
  })

  // Regression guard: the list used to carry `display: none` below 1080px,
  // which removed the whole bar on phones - the only way to reach a section
  // from a narrow viewport without scrolling the entire page. The 1080px
  // breakpoint belongs to the site header's primary links, not here. The bar
  // must render its links at every width and scroll horizontally instead.
  it('keeps every link in the markup at all widths rather than collapsing on narrow viewports', () => {
    const wrapper = mount(ProSectionNav)
    expect(wrapper.findAll('a')).toHaveLength(6)
    // No width-conditional rendering: the component emits the full list
    // unconditionally, so responsiveness is purely a CSS overflow concern.
    expect(wrapper.find('.pro-section-nav__list').exists()).toBe(true)
  })
})
