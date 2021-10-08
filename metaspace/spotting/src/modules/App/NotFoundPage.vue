<template>
  <content-page>
    <primary-icon large>
      <sign-svg />
    </primary-icon>
    <h1>This page could not be found</h1>
    <p class="pt-6">
      <a href="javascript:history.go(-1)">Go back</a>
    </p>
  </content-page>
</template>
<script>
import ContentPage from '../../components/ContentPage.vue'
import PrimaryIcon from '../../components/PrimaryIcon.vue'
import SignSvg from '../../assets/inline/refactoring-ui/icon-sign.svg'

export default {
  name: 'NotFoundPage',
  components: {
    ContentPage,
    PrimaryIcon,
    SignSvg,
  },
}
</script>
