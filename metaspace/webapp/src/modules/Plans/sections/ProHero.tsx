import { defineAsyncComponent, defineComponent, PropType } from 'vue'
import SignatureStrip from '../charts/SignatureStrip'
import { scrollToHashSection } from '../scrollToSection'
import METALogo from '../../../assets/METASPACE_logomark.png'

const MetaspaceWordmark = defineAsyncComponent(() => import('../../../assets/inline/METASPACE.svg'))

const formatCount = (value: number | null): string => (value == null ? '—' : value.toLocaleString('en-US'))

export default defineComponent({
  name: 'ProHero',
  props: {
    userCount: { type: Number as PropType<number | null>, default: null },
    datasetCount: { type: Number as PropType<number | null>, default: null },
    publicationCount: { type: Number as PropType<number | null>, default: null },
  },
  setup(props) {
    return () => (
      <header class="pro-hero" data-cta-section="hero">
        <div class="pro-shell pro-hero__row" style={{ paddingTop: 'clamp(56px, 7vw, 96px)' }}>
          <div class="pro-hero__copy">
            <p class="pro-eyebrow pro-eyebrow--accent">METASPACE Pro · ALL IN ONE · end-to-end</p>
            <h1 class="pro-h1">Turning peaks into insights</h1>
            <p class="pro-lede" style={{ maxWidth: '57ch' }}>
              Downstream functional analysis, now built directly onto the annotation engine you already trust and use —
              on data that never enters the public database until you say so.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', margin: '34px 0 16px' }}>
              <a
                href="#plans"
                data-cta="hero-submit"
                class="pro-btn pro-btn--accent min-w-[200px]"
                onClick={(e: MouseEvent) => scrollToHashSection(e, '#plans')}
              >
                Submit your private dataset
              </a>
              <a
                href="#analysis"
                data-cta="hero-explore"
                class="pro-btn pro-btn--ghost min-w-[200px]"
                onClick={(e: MouseEvent) => scrollToHashSection(e, '#analysis')}
              >
                Explore the analysis tools
              </a>
            </div>
            <p class="pro-note">
              All downstream analysis tools, on your first 3 free private dataset submitted · No card required
            </p>
          </div>

          <div class="pro-hero__figure">
            <div class="pro-hero__brand" role="img" aria-label="METASPACE Pro">
              <div class=" md:block relative w-20 h-20">
                <img alt="METASPACE logo" src={METALogo} class="w-full h-full" />
                <div class="absolute bottom-[14px] right-[12px]">
                  <span class="text-lg text-pro font-bold">Pro</span>
                </div>
              </div>
              <MetaspaceWordmark class="pro-hero__brand-mark" aria-hidden="true" />
            </div>
            <div class="pro-hero__figure-body">
              <SignatureStrip />
            </div>
          </div>
        </div>

        <div class="pro-section pro-section--band pro-section--ink">
          <div class="pro-shell">
            <div class="pro-stats">
              <div>
                <div class="pro-stats__value">{formatCount(props.userCount)}</div>
                <div class="pro-stats__label">researchers</div>
              </div>
              <div>
                <div class="pro-stats__value">{formatCount(props.datasetCount)}</div>
                <div class="pro-stats__label">datasets annotated</div>
              </div>
              <div>
                <div class="pro-stats__value">{formatCount(props.publicationCount)}</div>
                <div class="pro-stats__label">publications</div>
              </div>
              <div>
                <div class="pro-stats__value">2017</div>
                <div class="pro-stats__label">engine published in Nature Methods</div>
              </div>
            </div>
          </div>
        </div>
      </header>
    )
  },
})
