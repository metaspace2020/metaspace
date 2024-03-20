// @ts-nocheck
import { markRaw } from 'vue'
import Upload from './intro/steps/00-upload.md'
import Datasets from './intro/steps/10-datasets.md'
import Table from './intro/steps/20-table.md'
import Sorting from './intro/steps/30-sorting.md'
import Navigation from './intro/steps/40-navigation.md'
import Export from './intro/steps/50-export.md'

export default {
  id: 'sm-tour-intro',
  steps: [markRaw(Upload), markRaw(Datasets), markRaw(Table), markRaw(Sorting), markRaw(Navigation), markRaw(Export)],
}
