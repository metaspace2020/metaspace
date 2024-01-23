// @ts-nocheck
import {markRaw} from "vue";
import Panel from './filtering/steps/00-panel.md'
import Click from './filtering/steps/10-click.md'
import Select from './filtering/steps/20-select.md'
import Edit from './filtering/steps/30-edit.md'
import Remove from './filtering/steps/40-remove.md'
import Datasets from './filtering/steps/50-datasets.md'

export default {
  id: 'sm-tour-filtering',
  steps: [
    markRaw(Panel),
    markRaw(Click),
    markRaw(Select),
    markRaw(Edit),
    markRaw(Remove),
    markRaw(Datasets),
  ],
}
