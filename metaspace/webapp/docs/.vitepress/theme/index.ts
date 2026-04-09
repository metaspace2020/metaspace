import DefaultTheme from 'vitepress/theme'
import YouTubeEmbed from './components/YouTubeEmbed.vue'
import SideBySide from './components/SideBySide.vue'
import type { App } from 'vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }: { app: App }) {
    app.component('YouTubeEmbed', YouTubeEmbed)
    app.component('SideBySide', SideBySide)
  },
}
