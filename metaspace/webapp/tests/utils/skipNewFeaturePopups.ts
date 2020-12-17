import Vue from 'vue'

Vue.component('popup-anchor', {
  functional: true, // stops all attribute inheritance including classes
  render: function(h, context) {
    return context.children?.[0]
  },
})
