import convertTourStep from './convertTourStep'

export default {
  id: 'sm-tour-intro',
  steps: [
    require('./intro/steps/00-upload.md'),
    require('./intro/steps/10-datasets.md'),
    require('./intro/steps/20-table.md'),
    require('./intro/steps/30-sorting.md'),
    require('./intro/steps/40-navigation.md'),
    require('./intro/steps/50-export.md'),
  ].map(convertTourStep),
}
