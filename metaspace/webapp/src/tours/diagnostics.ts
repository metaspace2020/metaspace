// @ts-nocheck
import { markRaw } from 'vue'
import Overview from './diagnostics/steps/00-overview.md'
import Scores from './diagnostics/steps/10-scores.md'
import Spatial from './diagnostics/steps/20-spatial.md'
import Spectral from './diagnostics/steps/30-spectral.md'

export default {
  id: 'sm-tour-diagnostics',
  steps: [markRaw(Overview), markRaw(Scores), markRaw(Spatial), markRaw(Spectral)],
}
