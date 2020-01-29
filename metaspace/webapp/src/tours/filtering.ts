import convertTourStep from './convertTourStep'

export default {
  id: 'sm-tour-filtering',
  steps: [
    require('./filtering/steps/00-panel.md'),
    require('./filtering/steps/10-click.md'),
    require('./filtering/steps/20-select.md'),
    require('./filtering/steps/30-edit.md'),
    require('./filtering/steps/40-remove.md'),
    require('./filtering/steps/50-datasets.md'),
  ].map(convertTourStep),
}
