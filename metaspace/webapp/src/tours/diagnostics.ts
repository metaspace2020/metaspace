import convertTourStep from './convertTourStep'

export default {
  id: 'sm-tour-diagnostics',
  steps: [
    require('./diagnostics/steps/00-overview.md'),
    require('./diagnostics/steps/10-scores.md'),
    require('./diagnostics/steps/20-spatial.md'),
    require('./diagnostics/steps/30-spectral.md'),
  ].map(convertTourStep),
}
