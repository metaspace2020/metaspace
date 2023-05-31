import { computed, defineComponent } from '@vue/composition-api'

import config from '../../../../lib/config'
import safeJsonParse from '../../../../lib/safeJsonParse'
import { sortBy } from 'lodash-es'
import { Popover } from '../../../../lib/element-ui'

const interleave = <T extends any>(arr: T[], separator: T): T[] =>
  arr.flatMap(item => [separator, item]).slice(1)

const formatOffSampleProb = (offSampleProb: number) => {
  if (offSampleProb < 0.1) {
    return 'less than 10%'
  } else if (offSampleProb > 0.9) {
    return 'greater than 90%'
  } else {
    return (+offSampleProb * 100).toFixed(0) + '%'
  }
}

const DiagnosticsMetrics = defineComponent({
  name: 'DiagnosticsMetrics',
  props: {
    loading: { type: Number },
    annotation: { type: Object as () => any },
  },
  setup(props) {
    const metrics = computed(() => {
      const order = ['spatial', 'spectral', 'chaos', 'mz_err_abs', 'mz_err_rel']
      let metrics = props.annotation?.metricsJson != null ? safeJsonParse(props.annotation.metricsJson) : null
      if (metrics != null) {
        const sorted = sortBy(
          Object.entries(metrics).filter(([k, v]) => order.includes(k)),
          ([k, v]) => order.indexOf(k),
        )
        metrics = Object.fromEntries(sorted)
      }
      return metrics
    })

    const scoringModel = computed(() => {
      // eslint-disable-next-line camelcase
      return props.annotation != null ? safeJsonParse(props.annotation.dataset.configJson)?.fdr.scoring_model : null
    })

    return () => {
      const { loading, annotation } = props
      let metricsFormula
      if (loading) {
        metricsFormula = <div v-loading="1" class="msm-score-calc h-4" />
      } else if (metrics.value != null) {
        const isV1 = scoringModel.value == null
        const metricItems = [
          { name: ['ρ', <sub>spatial</sub>], formattedVal: metrics.value.spatial.toFixed(3) },
          { name: ['ρ', <sub>spectral</sub>], formattedVal: metrics.value.spectral.toFixed(3) },
          { name: ['ρ', <sub>chaos</sub>], formattedVal: metrics.value.chaos.toFixed(3) },
        ]
        if (!isV1) {
          metricItems.push(
            {
              name: ['m/z error', <sub>abs</sub>],
              formattedVal: [(metrics.value.mz_err_abs).toFixed(5)],
            },
            {
              name: ['m/z error', <sub>rel</sub>],
              formattedVal: [(metrics.value.mz_err_rel).toFixed(5)],
            },
          )
        }

        if (isV1) {
          metricsFormula = (
            <div class="msm-score-calc">
              {'MSM score = '}
              <span>{ annotation.msmScore.toFixed(3) }</span>
              {' = '}
              {interleave<any>(
                metricItems.map(item => ([item.formattedVal, ' (', item.name, ')'])), ' × ',
              )}
            </div>
          )
        } else {
          metricsFormula = (
            <div class="msm-score-calc">
              {'METASPACE-ML score = '}
              <span>{ annotation.msmScore.toFixed(3) }</span>
              {' = ML ('}
              {interleave<any>(
                metricItems.map(item => ([item.name, ' = ', item.formattedVal])), ', ',
              )}
              )
            </div>
          )
        }
      } else {
        metricsFormula = <div />
      }

      let offSampleTag
      if (config.features.off_sample && annotation?.offSample != null) {
        offSampleTag = (
          <div>
            <Popover trigger="hover" open-delay={100}>
              Image analysis gave an off-sample probability of { formatOffSampleProb(annotation.offSampleProb) }.
              <span slot="reference" class={annotation.offSample ? 'off-sample-tag' : 'on-sample-tag'}>
                { props.annotation.offSample ? 'Off-sample' : 'On-sample' }
              </span>
            </Popover>
          </div>
        )
      } else {
        offSampleTag = null
      }

      return (
        <el-row id="scores-table">
          {metricsFormula}
          {offSampleTag}
        </el-row>
      )
    }
  },
})

export default DiagnosticsMetrics
