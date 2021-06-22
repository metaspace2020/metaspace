<template>
  <div style="max-width: 500px;">
    <p>
      Search for ions with a specific neutral loss by entering the formula of the loss here,
      e.g. <span class="example-input">-H2O</span> to search for ions with H2O loss.
    </p>
    <p v-if="!features.neutral_losses_new_ds">
      This functionality is only intended for diagnosis when specific expected molecules
      were not found in a regular search. It may not be available until after the initial annotation has run.
    </p>
  </div>
</template>

<script>
import config from '../../../lib/config'

export default {
  name: 'NeutralLossesHelp',
  data() {
    return {
      features: config.features,
    }
  },
}
</script>

<style scoped>
  .example-input {
    background: #EEEEEE;
    padding: 2px 0;
    white-space: nowrap;
  }
</style>
