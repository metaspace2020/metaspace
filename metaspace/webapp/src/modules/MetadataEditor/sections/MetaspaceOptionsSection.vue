<template>
  <section-row class="md-annotation-rows" title="Search parameters" help="Changing these re-runs annotation">
    <el-form class="section-grid" size="default" label-position="top">
      <popup-anchor feature-key="uploadCustomDatabases" placement="top" class="block">
        <form-field
          type="selectMulti"
          name="Metabolite database"
          :help="dbHelp"
          :value="value?.databaseIds"
          :error="error && error?.databaseIds"
          :multiple-limit="maxMolDBs"
          required
          @remove-tag="onDbRemoval"
          @input="(val) => onInput('databaseIds', val)"
        >
          <template v-slot:options>
            <el-option-group v-for="group in databaseOptions" :key="group.label" :label="group.label">
              <el-option
                v-for="option in group.options"
                :key="option.value"
                :value="option.value"
                :label="option.label"
              />
            </el-option-group>
          </template>
        </form-field>
      </popup-anchor>
      <form-field
        type="selectMulti"
        name="Adducts"
        :value="value?.adducts"
        :error="error && error.adducts"
        :options="adductOptions"
        :help="AdductsHelp"
        required
        @input="(val) => onInput('adducts', val)"
      />
      <form-field
        type="text"
        name="Dataset name"
        placeholder="Dataset name"
        :value="value?.name"
        :error="error && error.name"
        required
        @input="(val) => onInput('name', val)"
      />
      <div class="section-grid__rule" aria-hidden="true" />
      <popup-anchor feature-key="v2" placement="top" :show-until="new Date('2022-09-01')" class="block">
        <form-field
          type="select"
          required
          name="Analysis version"
          :help="AnalysisVersionHelp"
          :value="value?.scoringModelId"
          :error="error && error.analysisVersion"
          :options="analysisVersionOptions"
          @input="(val) => onScoringModelChange(val)"
        />
      </popup-anchor>
      <div class="md-ppm">
        <form-field
          type="number"
          name="m/z tolerance"
          required
          :value="value?.ppm"
          :error="error && error.ppm"
          :help="PpmHelp"
          :min="0.1"
          :step="1"
          :max="15"
          @input="(val) => onInput('ppm', val)"
        />
        <span class="md-ppm__unit">ppm</span>
      </div>
      <form-field
        v-if="features.chem_mods"
        type="selectMultiWithCreate"
        name="Chemical modifications"
        :help="ChemModsHelp"
        :value="value?.chemMods"
        :error="error && error.chemMods"
        :multiple-limit="MAX_CHEM_MODS"
        :normalize-input="normalizeChemMod"
        @input="(val) => onInput('chemMods', val)"
      />
      <form-field
        v-if="features.neutral_losses"
        type="selectMultiWithCreate"
        name="Neutral losses"
        :help="NeutralLossesHelp"
        :value="value?.neutralLosses"
        :error="error && error.neutralLosses"
        :multiple-limit="MAX_NEUTRAL_LOSSES"
        :normalize-input="normalizeNeutralLoss"
        @input="(val) => onInput('neutralLosses', val)"
      />
      <popup-anchor
        v-if="features.enrichment"
        feature-key="v2"
        placement="top"
        :show-until="new Date('2022-09-01')"
        class="block"
      >
        <form-field
          type="selectMultiTree"
          name="Enrichment ontology"
          :help="EnrichmentHelp"
          :value="value?.ontologyDbIds"
          :error="error && error.performEnrichment"
          :options="ontologyDbs"
          @input="(val) => onInput('ontologyDbIds', val)"
        />
      </popup-anchor>
      <form-field
        v-if="features.advanced_ds_config"
        type="number"
        name="Isotopic peaks per formula"
        :value="value?.numPeaks"
        :error="error && error.numPeaks"
        is-integer
        :min="2"
        :max="16"
        @input="(val) => onInput('numPeaks', val)"
      />
      <form-field
        v-if="features.advanced_ds_config"
        type="number"
        name="Decoy adducts per formula"
        :value="value?.decoySampleSize"
        :error="error && error.decoySampleSize"
        is-integer
        :min="1"
        :max="80"
        @input="(val) => onInput('decoySampleSize', val)"
      />
    </el-form>
  </section-row>
</template>

<script lang="ts">
import { defineComponent, PropType, ref, computed } from 'vue'
import FormField from '../inputs/FormField.vue'
import PopupAnchor from '../../../modules/NewFeaturePopup/PopupAnchor.vue'
import { MetaspaceOptions } from '../formStructure'
import config, { limits } from '../../../lib/config'
import { normalizeFormulaModifier } from '../../../lib/normalizeFormulaModifier'
import { MolecularDB } from '../../../api/moldb'
import { formatDatabaseLabel, MolDBsByGroup } from '../../MolecularDatabases/formatting'
import { sortBy } from 'lodash-es'
import { ElMessage, ElForm } from '../../../lib/element-plus'
import { SectionRow } from '../v2/components/SectionRow'
import DatabaseHelpLink from '../inputs/DatabaseHelpLink.vue'
import AnalysisVersionHelp from '../inputs/AnalysisVersionHelp.vue'
import EnrichmentHelp from '../inputs/EnrichmentHelp.vue'
import AdductsHelp from '../inputs/AdductsHelp.vue'
import NeutralLossesHelp from '../inputs/NeutralLossesHelp.vue'
import PpmHelp from '../inputs/PpmHelp.vue'
import ChemModsHelp from '../inputs/ChemModsHelp.vue'
import { MAX_CHEM_MODS, MAX_NEUTRAL_LOSSES } from '../../../lib/constants'
import { EnrichmentDB } from '../../../api/enrichmentdb'

export default defineComponent({
  name: 'MetaspaceOptionsSection',
  components: {
    FormField,
    PopupAnchor,
    SectionRow,
    ElForm,
  },
  props: {
    value: { type: Object as PropType<MetaspaceOptions>, required: true },
    error: { type: Object as any, default: () => ({}) },
    databasesByGroup: { type: Array as PropType<MolDBsByGroup[]>, required: true },
    defaultDb: { type: Object as PropType<MolecularDB | null>, required: true },
    adductOptions: { type: Array as PropType<{ value: string; label: string }[]>, required: true },
    ontologyDbs: { type: Array as PropType<EnrichmentDB> | any },
    scoringModels: { type: Array as PropType<{ name: string }[]>, required: true },
    isNewDataset: { type: Boolean, required: true },
  },
  setup(props, { emit }) {
    const features = config.features
    const maxMolDBs = ref(limits.maxMolDBs)
    const neutralLossOptions = ref([])
    const chemModOptions = ref([])

    const analysisVersionOptions = computed(() => {
      let options = (props.scoringModels ?? []).map((m: any) => ({
        value: m.id,
        disabled: m.isArchived,
        type: m.type,
        label: `${m.isArchived ? '(ARCHIVED) ' : ''}${m.type === 'original' ? m.version : m.name + '_' + m.version} (${
          m.type === 'original' ? 'Original MSM' : 'METASPACE-ML'
        })`,
      }))
      options = options.filter((o) =>
        props.isNewDataset
          ? !o.disabled
          : !(!props.isNewDataset && !(!o.disabled || (o.disabled && o.value === props.value?.scoringModelId)))
      )

      return options
    })

    const databaseOptions = computed(() => {
      return props.databasesByGroup.map(({ shortName, molecularDatabases }) => ({
        label: shortName,
        options: sortBy(
          molecularDatabases.map((db) => ({
            value: db.id,
            label: formatDatabaseLabel(db),
          })),
          'label'
        ),
      }))
    })

    const onInput = (field: keyof MetaspaceOptions, val: any) => {
      emit('change', { field, val })
    }

    const onScoringModelChange = (val: any) => {
      const scoringModel: any = analysisVersionOptions.value.find((m) => m.value === val)
      emit('change', { field: 'scoringModelId', val: scoringModel.value })
    }

    const onDbRemoval = (val: any) => {
      if (props.defaultDb && val === props.defaultDb.id) {
        ElMessage({
          message: `${props.defaultDb.group?.shortName || 'METASPACE'}
        ${formatDatabaseLabel(props.defaultDb)} is the default database and It can not be removed.`,
        })
        onInput('databaseIds', props.value?.databaseIds.concat(val))
      }
    }

    const normalizeNeutralLoss = (query: string) => normalizeFormulaModifier(query, '-')
    const normalizeChemMod = (query: string) => normalizeFormulaModifier(query, '+')

    return {
      analysisVersionOptions,
      databaseOptions,
      onInput,
      onScoringModelChange,
      onDbRemoval,
      normalizeNeutralLoss,
      normalizeChemMod,
      dbHelp: DatabaseHelpLink,
      MAX_CHEM_MODS,
      MAX_NEUTRAL_LOSSES,
      maxMolDBs,
      AdductsHelp,
      ChemModsHelp,
      PpmHelp,
      NeutralLossesHelp,
      EnrichmentHelp,
      AnalysisVersionHelp,
      DatabaseHelpLink,
      features,
      neutralLossOptions,
      chemModOptions,
    }
  },
})
</script>

<style lang="scss">
.md-ppm {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  .md-form-field {
    width: 86px;
    flex-shrink: 0;
  }
  .el-form-item__label {
    white-space: nowrap;
  }
}
.md-ppm__unit {
  display: flex;
  align-items: center;
  height: 32px;
  font-size: 12px;
  color: #829bb0;
}
.example-input {
  background: #eeeeee;
  padding: 2px 8px;
  white-space: nowrap;
}
</style>
