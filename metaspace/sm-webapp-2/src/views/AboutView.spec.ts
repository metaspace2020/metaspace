import { describe, expect, it } from "vitest";
import TheWelcomeVue from "./View";
import { mount } from '@vue/test-utils'

describe('MyComponent', () => {
  it('renders correctly', () => {
    const wrapper = mount(TheWelcomeVue)
    expect(wrapper.html()).not.toContain('Some text')
  })
})
