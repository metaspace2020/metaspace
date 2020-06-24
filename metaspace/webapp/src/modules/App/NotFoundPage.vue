<template>
  <div class="sm-content-page">
    <SignIcon class="sm-colour-icon sm-colour-icon--large" />
    <h1>This page could not be found</h1>
    <p class="pt-6">
      <a href="javascript:history.go(-1)">Go back</a>
    </p>
  </div>
</template>
<script>
import '../../components/ColourIcon.css'
import './content.css'

import SignIcon from '../../assets/inline/refactoring-ui/sign.svg'

export default {
  name: 'NotFoundPage',
  components: {
    SignIcon,
  },
}
</script>
