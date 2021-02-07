<template>
  <div class="sm-content-page">
    <primary-icon large>
      <sign-svg />
    </primary-icon>
    <h1>This page could not be found</h1>
    <p class="pt-6">
      <a href="javascript:history.go(-1)">Go back</a>
    </p>
  </div>
</template>
<script>
import './content.css'

import PrimaryIcon from '../../components/PrimaryIcon.vue'
import SignSvg from '../../assets/inline/refactoring-ui/icon-sign.svg'

export default {
  name: 'NotFoundPage',
  components: {
    PrimaryIcon,
    SignSvg,
  },
}
</script>
