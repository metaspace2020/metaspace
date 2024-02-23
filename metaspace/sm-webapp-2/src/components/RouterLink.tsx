import { defineComponent } from 'vue'
import { useRouter } from 'vue-router'

export default defineComponent({
  name: 'RouterLink',
  props: ['to', 'class', 'id', 'newTab'],
  setup(props, { slots }) {
    const router = useRouter()
    const handleNavigation = async (params: any) => {
      if (props.newTab) {
        const route = router.resolve(params)
        window.open(route.href, '_blank')
        return
      }
      await router.push(params)
    }

    return () => (
      <div
        class={['text-blue-600 hover:text-blue-700 underline cursor-pointer', props.class]}
        data-test-key={props.id}
        onClick={() => handleNavigation(props.to)}
      >
        {slots.default ? slots.default() : ''}
      </div>
    )
  },
})
