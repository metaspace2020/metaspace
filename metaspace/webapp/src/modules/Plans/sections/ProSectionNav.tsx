import { defineComponent } from 'vue'
import { scrollToHashSection } from '../scrollToSection'

const LINKS = [
  { label: 'Analysis', hash: '#analysis' },
  { label: 'Privacy', hash: '#privacy' },
  { label: 'Docs', hash: '#docs' },
  { label: 'Plans', hash: '#plans' },
  { label: 'Procurement', hash: '#procurement' },
  { label: 'FAQ', hash: '#faq' },
]

// Sticky link bar directly below the site header. Purely navigational - no
// button, no CTA - so visitors can jump between sections of the long
// landing page without scrolling back to the top.
export default defineComponent({
  name: 'ProSectionNav',
  setup() {
    return () => (
      <nav class="pro-section-nav" aria-label="Page sections">
        <div class="pro-shell">
          <ul class="pro-section-nav__list">
            {LINKS.map((link) => (
              <li key={link.hash}>
                <a href={link.hash} onClick={(e: MouseEvent) => scrollToHashSection(e, link.hash)}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    )
  },
})
