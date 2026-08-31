import { defineComponent } from 'vue'

interface DocCard {
  kicker: string
  title: string
  body: string
  href: string
}

// Deliberately free of publication/citability claims - that argument is made
// once, in the methods callout, and must not be duplicated here.
const DOC_CARDS: DocCard[] = [
  {
    kicker: 'Pipeline',
    title: 'Private submission, end to end',
    body: 'From imzML upload and the private toggle through annotation to a finished result.',
    href: '/docs/getting-started/typical-workflows.html',
  },
  {
    kicker: 'Guide',
    title: 'Differential analysis by region',
    body: 'Drawing regions and reading how strongly each ion differs between them.',
    href: '/docs/features/spatial-pattern-analysis/roi-differential-analysis.html',
  },
  {
    kicker: 'Guide',
    title: 'Spatial segmentation',
    body: 'Picking the number of segments and tracing each one back to its driver ions.',
    href: '/docs/features/spatial-pattern-analysis/spatial-segmentation.html',
  },
  {
    kicker: 'Guide',
    title: 'Cross-dataset statistics',
    body: 'Comparing datasets across your experimental design, without the manual bookkeeping.',
    href: '/docs/features/cross-dataset-comparison/cross-dataset-statistical-analysis.html',
  },
]

export default defineComponent({
  name: 'ProDocs',
  setup() {
    return () => (
      <section id="docs" class="pro-section">
        <div class="pro-shell">
          <p class="pro-eyebrow">Documentation</p>
          <h2 class="pro-h2" style={{ maxWidth: '20ch' }}>
            Every step is written down
          </h2>
          <p class="pro-lede">
            Each tool has a guide that walks the whole pipeline on a real dataset — what to click, which parameters
            matter, how to read the output and where the assumptions are.
          </p>

          <div class="pro-docs-cards">
            {DOC_CARDS.map((card) => (
              <a class="pro-card" target="_blank" rel="noopener noreferrer" href={card.href} key={card.title}>
                <p class="pro-eyebrow" style={{ marginBottom: '10px' }}>
                  {card.kicker}
                </p>
                <h3 class="pro-h3" style={{ fontSize: '16px' }}>
                  {card.title}
                </h3>
                <div class="pro-docs-card__body" style={{ fontSize: '15px' }}>
                  {card.body}
                </div>
              </a>
            ))}
          </div>

          <p style={{ margin: '28px 0 0' }}>
            <a href="/docs" style={{ fontWeight: 500 }}>
              Browse the full documentation →
            </a>
          </p>
        </div>
      </section>
    )
  },
})
