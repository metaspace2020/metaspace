import Vue, { CreateElement } from 'vue'
import { Prop, Component } from 'vue-property-decorator'
import { dialogRoutes } from '../dialogs'

/**
 * This component is needed for a weird pattern in CreateAccountDialog/SignInDialog:
 * * when they display as a dialog over some other page, they should behave like a dialog and any links to other dialogs
 *   should just replace the existing dialog
 * * when they display as a stand-alone page, they should behave like a page and internal links should navigate away
 * In both cases, links should have a `href`
 */
@Component
export default class InterDialogLink extends Vue {
  @Prop({ type: String, required: true })
  dialog!: string;

  get link() {
    return dialogRoutes[this.dialog]
  }

  render(h: CreateElement) {
    return h('a', {
      attrs: {
        href: this.$router.resolve(this.link, this.$route).href,
      },
      on: {
        click: (e: Event) => {
          e.preventDefault()
          if (this.$store.state.account.dialogCloseRedirect != null) {
            this.$router.push(this.link)
          } else {
            this.$store.commit('account/showDialog', this.dialog)
          }
        },
      },
    }, this.$slots.default)
  }
}
