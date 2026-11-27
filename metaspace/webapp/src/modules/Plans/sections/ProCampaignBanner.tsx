import { defineComponent, PropType } from 'vue'
import type { BlackFridayCampaign, CyberMondayCampaign } from '../campaign'
import { campaignLabels, formatCampaignDate as formatDate } from '../campaign'

/** Day, month and year stay on one line when a banner wraps. */
const formatCampaignDate = (iso: string, withYear: boolean): string => formatDate(iso, withYear).replace(/ /g, '\u00a0')
import { scrollToHashSection } from '../scrollToSection'

interface BannerRow {
  key: string
  label: string
  text: string
  linkLabel: string
  hash: string
  slate: boolean
}

/**
 * Campaign banners under the site header, one row per live campaign. Cyber Monday comes first when both are live.
 * Renders nothing when no campaign is live, so the page is unchanged outside the windows.
 */
export default defineComponent({
  name: 'ProCampaignBanner',
  props: {
    blackFriday: { type: Object as PropType<BlackFridayCampaign | null>, default: null },
    cyberMonday: { type: Object as PropType<CyberMondayCampaign | null>, default: null },
  },
  setup(props) {
    const rows = (): BannerRow[] => {
      const result: BannerRow[] = []
      const bf = props.blackFriday
      const cm = props.cyberMonday
      if (cm) {
        result.push({
          key: 'cyber-monday',
          label: 'CYBER MONDAY',
          text: `A free month of downstream analysis — claim by ${formatCampaignDate(cm.end, true)}`,
          linkLabel: 'Claim it',
          hash: '#claim',
          slate: false,
        })
      }
      if (bf) {
        const until = formatCampaignDate(bf.end, true)
        const name = campaignLabels(bf).name.toUpperCase()
        result.push(
          cm
            ? {
                key: 'black-friday',
                label: name,
                text: `Up to ${bf.headlinePercent}% off plans with your plan's code — until ${until}`,
                linkLabel: 'See codes',
                hash: '#plans',
                slate: true,
              }
            : {
                key: 'black-friday',
                label: `${name} · UNTIL ${until.toUpperCase()}`,
                text:
                  `Up to ${bf.headlinePercent}% off METASPACE Pro plans` +
                  `${bf.renamed ? ` until ${until}` : ''}. Each plan has its own code.`,
                linkLabel: 'See the codes',
                hash: '#plans',
                slate: false,
              }
        )
      }
      return result
    }

    return () => {
      const items = rows()
      if (!items.length) {
        return null
      }
      return (
        <div class="pro-campaign-banners">
          {items.map((row) => (
            <div key={row.key} class={['pro-campaign-banner', row.slate && 'pro-campaign-banner--slate']}>
              <span class="pro-campaign-banner__label">{row.label}</span>
              <span class="pro-campaign-banner__text">{row.text}</span>
              <a
                class="pro-campaign-banner__link"
                href={row.hash}
                onClick={(e: MouseEvent) => scrollToHashSection(e, row.hash)}
              >
                {row.linkLabel}
                <svg
                  class="pro-campaign-banner__arrow"
                  viewBox="0 0 16 16"
                  width="14"
                  height="14"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" />
                </svg>
              </a>
            </div>
          ))}
        </div>
      )
    }
  },
})
