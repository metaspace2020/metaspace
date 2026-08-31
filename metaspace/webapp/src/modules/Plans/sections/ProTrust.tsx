import { defineComponent } from 'vue'
import { PRO_FLAGS } from '../proContent'

interface ProcurementLine {
  text: string
  // Unverified copy (quote validity, invoicing entity) hidden behind
  // PRO_FLAGS.procurementDetail until it is confirmed.
  detail?: boolean
}

// Listed in the order the design calls for; the unverified lines sit inline
// rather than appended, so hiding them never reshuffles the rest.
const PROCUREMENT_LINES: ProcurementLine[] = [
  { text: 'Formal quote as a PDF, valid 60 days — usable inside a grant application', detail: true },
  { text: 'Purchase orders and institutional invoicing accepted on every paid plan' },
  { text: 'Multi-year plans lock the price for the length of a funding period; 1-2 year terms by quote' },
  { text: 'Invoices issued by Metacloud Inc. with full institutional details — metacloud.bio', detail: true },
]

// The one procurement line that credits the invoicing entity - its trailing
// domain is swapped for a link to Metacloud's site wherever it's rendered.
const METACLOUD_LINE = 'Invoices issued by Metacloud Inc. with full institutional details — metacloud.bio'

export default defineComponent({
  name: 'ProTrust',
  setup() {
    return () => (
      <section id="procurement" class="pro-section">
        <div
          class="pro-shell"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(36px, 5vw, 56px)', alignItems: 'flex-start' }}
        >
          <div style={{ flex: '1 1 420px' }}>
            <p class="pro-eyebrow">For institutions</p>
            <h2 class="pro-h2" style={{ maxWidth: '18ch' }}>
              Set up for how institutions already pay
            </h2>
            <p style={{ margin: 0, color: '#55636E', maxWidth: '60ch' }}>
              No subscription needs to go on a personal card. Every paid plan works with how institutions actually pay —
              purchase orders, invoices, and budgets that plan more than a year out.
            </p>
            <ul class="pro-checklist">
              {PROCUREMENT_LINES.filter((line) => !line.detail || PRO_FLAGS.procurementDetail).map((line, index) => (
                <li key={index}>
                  {line.text === METACLOUD_LINE ? (
                    <>
                      Invoices issued by Metacloud Inc. with full institutional details —{' '}
                      <a href="https://metacloud.bio" target="_blank" rel="noopener noreferrer">
                        metacloud.bio
                      </a>
                    </>
                  ) : (
                    line.text
                  )}
                </li>
              ))}
            </ul>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '32px' }}>
              <a href="/contact" class="pro-btn pro-btn--accent">
                Request a quote
              </a>
              <a href="/contact" class="pro-btn pro-btn--ghost">
                Contact the team
              </a>
            </div>
          </div>

          <div class="pro-quote-box">
            <div class="pro-quote-box__head">Ready to paste into a budget request</div>
            <div class="pro-quote-box__body">
              <p style={{ margin: 0 }}>
                METASPACE Pro subscription (Advanced tier) — cloud-based spatial metabolomics annotation and statistical
                analysis platform.
              </p>
              <p style={{ margin: '1.75em 0 0' }}>$2,999 per year × 2 years = $5,698</p>
              <p style={{ margin: '1.75em 0 0', color: '#7C8892' }}>Metacloud Inc. · quote ref. on request</p>
            </div>
          </div>
        </div>
      </section>
    )
  },
})
