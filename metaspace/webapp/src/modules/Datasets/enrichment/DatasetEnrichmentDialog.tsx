import { defineComponent } from '@vue/composition-api'
import { Button, Dialog } from '../../../lib/element-ui'
import './DatasetEnrichmentDialog.scss'

interface DatasetEnrichmentDialogProps {
  dataset: any
}

export const DatasetEnrichmentDialog = defineComponent<DatasetEnrichmentDialogProps>({
  name: 'DatasetEnrichmentDialog',
  props: {
    dataset: {
      type: Object,
      default: () => {},
    },
  },
  // @ts-ignore
  setup(props, { refs, emit, root }) {
    return () => {
      const { dataset } = props

      return (
        <Dialog
          visible
          onclose={() => emit('close')}
          class="dataset-enrichment-dialog sm-content-page el-dialog-lean">
          Enrichment
          <div class='w-full flex flex-wrap'>
            {
              (dataset.status !== 'FINISHED' && dataset.status !== 'FAILED')
              && <span> Wait for the dataset to process, in order to apply the enrichment </span>
            }
            {
              !(dataset.status !== 'FINISHED' && dataset.status !== 'FAILED')
              && <span> Apply enrichment?  </span>
            }
            {
              !(dataset.status !== 'FINISHED' && dataset.status !== 'FAILED')
              && <div class='w-full flex justify-end items-center'>
                <Button onClick={() => emit('enrich')} type="primary">
                  Apply
                </Button>
              </div>
            }
          </div>
        </Dialog>
      )
    }
  },
})
