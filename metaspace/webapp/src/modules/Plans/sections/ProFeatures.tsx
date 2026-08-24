import { defineComponent } from 'vue'
import ProChart from '../charts/ProChart'
import { ProChartKind } from '../charts/proCharts'

interface FeatureRow {
  question: string
  title: string
  body: string
  instead: string
  chart: ProChartKind
  caption: string
}

const FEATURES: FeatureRow[] = [
  {
    question: '“Which metabolites actually differ?”',
    title: 'Differential analysis by region',
    body:
      'Draw a region of interest on the tissue. Get the metabolites that differ between regions, ranked by log2 ' +
      'fold change and AUC — how strongly each ion discriminates that region from everywhere else — ready to drop ' +
      'straight into a figure.',
    instead: 'exporting masks and scripting the comparison yourself.',
    chart: 'volcano',
    caption: 'Every annotated ion, by intensity change and how well it discriminates the region',
  },
  {
    question: '“Where are the compartments?”',
    title: 'Spatial segmentation',
    body:
      'Find the compartments your tissue actually has, not the ones you drew by eye. Every segment links back to ' +
      'the annotations that define it.',
    instead: 'clustering in a separate tool, then hand-mapping clusters back to ions.',
    chart: 'segmentation',
    caption: 'Segment map + per-segment annotations',
  },
  {
    question: '“Does it hold across experiments?”',
    title: 'Cross-dataset statistics',
    body:
      'Compare datasets across conditions, timepoints and batches in a single test, with your experimental ' +
      'design built into the statistics.',
    instead: 'wrangling annotations and metadata across datasets yourself, every time.',
    chart: 'heatmap',
    caption: 'Cross-dataset comparison that fits your experimental design',
  },
]

const RAIL = [
  {
    step: 'Upload',
    title: 'Your imzML, the same upload page',
    body: 'Nothing new to install. One toggle marks the dataset private and keeps it inside your group.',
    accent: false,
  },
  {
    step: 'Annotate',
    title: 'The engine you already trust',
    body: 'Identical annotation engine, identical FDR control, scored against the same databases.',
    accent: false,
  },
  {
    step: 'Analyse',
    title: 'Ask the question here',
    body: 'Draw regions, segment the tissue, or pull the whole experiment into one test — in the browser.',
    accent: true,
  },
]

const PRIVACY = [
  {
    title: 'Nothing private enters the knowledgebase',
    body:
      'Your private datasets and annotations stay inside' +
      ' your group until you explicitly choose to publish them. Nothing ' +
      'is contributed to the public knowledgebase on your behalf.',
  },
  {
    title: 'Nothing is locked in',
    body:
      'Export your annotations and results at any time, on any plan — including after a subscription ends. Raw ' +
      'files download too, up to two datasets a day. Your science stays yours.',
  },
]

export default defineComponent({
  name: 'ProFeatures',
  setup() {
    return () => (
      <>
        <section class="pro-section pro-section--tight pro-section--tint">
          <div class="pro-shell">
            <div class="pro-callout pro-callout--blue">
              <div class="pro-callout__body">
                <h3 class="pro-h3">METASPACE Academic is still free, still open source, still public.</h3>
                <p>
                  The annotation engine, public submissions and the community knowledgebase are unchanged and will stay
                  that way. METASPACE Pro is for the work you can&apos;t publish yet — and for what happens after
                  annotation.
                </p>
              </div>
              <a href="/split" target="_blank" style={{ alignSelf: 'center', fontWeight: 500, whiteSpace: 'nowrap' }}>
                Why we split →
              </a>
            </div>
          </div>
        </section>

        <section class="pro-section pro-section--tint">
          <div class="pro-shell">
            <p class="pro-eyebrow">The gap</p>
            <h2 class="pro-h2" style={{ maxWidth: '22ch' }}>
              Your annotations are done. Now what?
            </h2>
            <p class="pro-lede">
              As your datasets and annotations grow, so does the work of turning them into answers — normally that
              means stepping outside the platform, exporting results, and stitching together scripts by hand.
            </p>
            <p style={{ margin: '20px 0 0', color: '#55636E', maxWidth: '66ch', fontSize: '18px' }}>
              METASPACE Pro brings that analysis into the browser, directly on the annotations you already trust —
              interactive, and built for anyone working with the data, not just people who script.
            </p>
          </div>
        </section>

        <section id="analysis" class="pro-section">
          <div class="pro-shell">
            <p class="pro-eyebrow pro-eyebrow--accent">How it works</p>
            <h2 class="pro-h2" style={{ maxWidth: '20ch' }}>
              From imzML to answer, without an export
            </h2>

            <div class="pro-rail">
              {RAIL.map((item, index) => [
                <div key={`step-${item.step}`} class={`pro-rail__step ${item.accent ? 'pro-rail__step--accent' : ''}`}>
                  <p class={`pro-eyebrow ${item.accent ? 'pro-eyebrow--accent' : ''}`} style={{ marginBottom: '10px' }}>
                    {item.step}
                  </p>
                  <h4 class="pro-h3" style={{ fontSize: '17px' }}>
                    {item.title}
                  </h4>
                  <p style={{ margin: 0, fontSize: '14.5px', color: '#55636E', lineHeight: 1.55 }}>{item.body}</p>
                </div>,
                index < RAIL.length - 1 ? (
                  <div key={`arrow-${item.step}`} class="pro-rail__arrow">
                    <span>→</span>
                  </div>
                ) : null,
              ])}
            </div>

            <p class="pro-tools-caption">Questions your annotations can now answer</p>

            {FEATURES.map((feature, index) => (
              <div class={`pro-feature ${index === 1 ? 'pro-feature--flip' : ''}`} key={feature.chart}>
                <div class="pro-feature__copy">
                  <p class="pro-eyebrow">{feature.question}</p>
                  <h3 class="pro-h2" style={{ fontSize: '27px', margin: '14px 0' }}>
                    {feature.title}
                  </h3>
                  <p style={{ margin: 0, color: '#55636E', maxWidth: '56ch' }}>{feature.body}</p>
                  <div class="pro-feature__instead">
                    <b>Instead of:</b> {feature.instead}
                  </div>
                </div>
                <div class="pro-feature__media">
                  <ProChart kind={feature.chart} caption={feature.caption} />
                </div>
              </div>
            ))}

            <p style={{ margin: '0 0 0', fontSize: '15px', color: '#55636E', fontWeight: 'bold' }}>
              * Every analysis tool — including new ones as they ship — is enabled on your three free private
              datasets a year, so you can judge them on your own data before you spend anything.
            </p>
          </div>
        </section>

        <section id="privacy" class="pro-section pro-section--tint">
          <div class="pro-shell">
            <p class="pro-eyebrow pro-eyebrow--accent">Private by design</p>
            <h2 class="pro-h2" style={{ maxWidth: '24ch' }}>
              Your data never touches the public database until you say so
            </h2>
            <p class="pro-lede">Two guarantees, in plain terms, with no asterisks.</p>
            <div class="pro-grid">
              {PRIVACY.map((item) => (
                <div key={item.title}>
                  <h3 class="pro-h3" style={{ fontSize: '18px' }}>
                    {item.title}
                  </h3>
                  <p>{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </>
    )
  },
})
