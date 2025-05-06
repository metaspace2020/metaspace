import { defineComponent, defineAsyncComponent, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElButton } from '../../lib/element-plus'
import { currentUserRoleQuery } from '../../api/user'
import { useQuery } from '@vue/apollo-composable'

import './SuccessPage.scss'

const SuccessCheckIcon = defineAsyncComponent(() => import('../../assets/success-check.svg'))

export default defineComponent({
  name: 'SuccessPage',
  setup() {
    const router = useRouter()
    const route = useRoute()

    const { result: currentUserResult } = useQuery<any>(currentUserRoleQuery, null, {
      fetchPolicy: 'network-only',
    })
    const currentUser = computed(() => currentUserResult.value?.currentUser)

    const goToUpload = () => {
      router.push('/upload')
    }

    onMounted(() => {
      const fromPayment = route.query.from === 'payment' || !!route.query.session_id
      console.log('fromPayment', route)
      console.log('fromPaymentX', router)

      if (!currentUser.value || !fromPayment) {
        // router.push('/404')
      }
    })

    return () => {
      if (!currentUser.value) return null

      return (
        <div class="success-page">
          <div class="success-container">
            <div class="success-icon">
              <SuccessCheckIcon />
            </div>
            <h1 class="success-title">Subscription successful!</h1>
            <p class="success-message">
              Thank you for joining the community! You can immediately start exploring your benefits. You will also
              receive an email confirmation with details.
            </p>
            <div class="actions">
              <ElButton type="primary" class="api-docs-button" onClick={goToUpload}>
                Upload your data
              </ElButton>
            </div>
          </div>
        </div>
      )
    }
  },
})
