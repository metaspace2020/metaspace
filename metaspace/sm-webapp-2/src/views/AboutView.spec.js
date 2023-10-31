import HelloWorld from "./AboutView.vue"
import { mount } from "@vue/test-utils"
import { nextTick } from 'vue';

describe("HelloWorld", () => {
    it("renders properly", async() => {
        const wrapper = mount(HelloWorld, { props: { msg: "Hello Jest" } })
        await nextTick()

        expect(wrapper).toMatchSnapshot()
    })
})