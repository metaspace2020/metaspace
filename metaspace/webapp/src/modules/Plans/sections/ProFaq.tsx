import { defineComponent, reactive } from 'vue'
import type { VNode } from 'vue'

interface FaqEntry {
  question: string
  answer: (string | (() => VNode))[]
}

const FAQS: FaqEntry[] = [
  {
    question: 'Is METASPACE Academic still free?',
    answer: [
      () => (
        <>
          Yes, and it stays that way. Public submissions, the annotation engine and the community knowledgebase remain
          free and open source, developed by the{' '}
          <a href="https://ateam.bio/" target="_blank" rel="noopener noreferrer">
            Alexandrov team
          </a>{' '}
          at UCSD. Pro is a separate subscription service from{' '}
          <a href="https://metacloud.bio/" target="_blank" rel="noopener noreferrer">
            Metacloud Inc.
          </a>{' '}
          for private work.
        </>
      ),
    ],
  },
  {
    question: 'Do I have to pay to try the analysis tools?',
    answer: [
      'No. All analysis tools run on the free tier, on your three free private datasets a year. Paid plans raise ' +
        "that ceiling — they don't unlock the features. Three datasets is enough to judge the tools on your own " +
        "dataset; it isn't enough for a real cross-dataset study.",
    ],
  },
  {
    // Scoped to the knowledgebase only. Do not reintroduce a model-training
    // claim here - it is not something the page is in a position to promise.
    question: 'Does my private data enter the public knowledgebase?',
    answer: [
      'No. Private datasets and their annotations stay inside your group. If you later choose to make a dataset ' +
        'public, you do that explicitly, one dataset at a time.',
    ],
  },
  {
    question: 'Can I cite METASPACE Pro analysis in a paper?',
    answer: [
      () => (
        <>
          Yes. The statistical methods, corrections and assumptions are{' '}
          <a
            href="/docs/features/cross-dataset-comparison/cross-dataset-statistical-analysis.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            documented in full
          </a>
          , and the underlying annotation engine is published in{' '}
          <a href="https://www.nature.com/articles/nmeth.4072" target="_blank" rel="noopener noreferrer">
            Nature Methods (Palmer et al., 2017)
          </a>
          . Citation guidance is on the methods page.
        </>
      ),
    ],
  },
  {
    question: 'What happens to the private datasets I submitted before the split?',
    answer: [
      'They remain accessible. Datasets submitted privately before November 2025 are unaffected by the split and ' +
        "don't count against your current quota.",
    ],
  },
  {
    question: 'What happens to my data if we stop subscribing?',
    answer: [
      'You can export your annotations and results at any time, including after a subscription ends, and download ' +
        'raw files up to two datasets a day. Existing private datasets stay accessible; you simply return to the ' +
        'free ceiling for new submissions.',
    ],
  },
  {
    question: 'Do we pay per person?',
    answer: [
      'No. Group members and projects are unlimited on every plan, including Free. Plans are priced on private ' +
        'dataset throughput, not headcount.',
    ],
  },
]

export default defineComponent({
  name: 'ProFaq',
  setup() {
    const state = reactive({ open: 0 })

    return () => (
      <>
        <section id="faq" class="pro-section pro-section--tint">
          <div class="pro-shell">
            <p class="pro-eyebrow">Questions</p>
            <h2 class="pro-h2" style={{ marginBottom: 0 }}>
              Before you decide
            </h2>
            <div class="pro-faq">
              {FAQS.map((entry, index) => {
                const isOpen = state.open === index
                return (
                  <div class="pro-faq__item" key={entry.question}>
                    <button
                      type="button"
                      class="pro-faq__trigger"
                      aria-expanded={isOpen ? 'true' : 'false'}
                      onClick={() => {
                        state.open = isOpen ? -1 : index
                      }}
                    >
                      <span>{entry.question}</span>
                      <span class="pro-faq__marker" aria-hidden="true">
                        {isOpen ? '−' : '+'}
                      </span>
                    </button>
                    {isOpen && (
                      <div class="pro-faq__answer">
                        {entry.answer.map((paragraph, paragraphIndex) => (
                          <p key={paragraphIndex}>{typeof paragraph === 'function' ? paragraph() : paragraph}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section class="pro-section">
          <div class="pro-shell">
            <div class="pro-cta">
              <h2 class="pro-h2">Try it on your own data today</h2>
              <p class="pro-cta__lede">
                Three private datasets a year are included with every METASPACE account. Try the analysis tools on your
                own data before you decide anything.
              </p>
              <div class="pro-cta__actions">
                <a href="/upload" target="_blank" rel="noopener noreferrer" class="pro-btn pro-btn--accent">
                  Submit a private dataset
                </a>
                <a href="/contact" target="_blank" rel="noopener noreferrer" class="pro-btn pro-btn--ghost">
                  Request a quote for your group
                </a>
              </div>
              <p class="pro-note">No card required · Export your results at any time · Academic stays free</p>
            </div>
          </div>
        </section>
      </>
    )
  },
})
