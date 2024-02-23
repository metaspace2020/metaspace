<template>
  <div class="metadata-section">
    <el-form size="default" label-position="top">
      <el-row>
        <el-col :span="6">
          <div class="metadata-section__title">Annotation settings</div>
        </el-col>
        <el-col :span="18">
          <el-row :gutter="8">
            <el-col :span="8">
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
            </el-col>
            <el-col :span="8">
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
            </el-col>
            <el-col :span="8">
              <form-field
                type="text"
                name="Dataset name"
                placeholder="Dataset name"
                :value="value?.name"
                :error="error && error.name"
                required
                @input="(val) => onInput('name', val)"
              />
            </el-col>
          </el-row>
          <el-row v-if="features.neutral_losses || features.chem_mods || features.advanced_ds_config" :gutter="8">
            <el-col v-if="features.neutral_losses" :span="8">
              <form-field
                type="selectMultiWithCreate"
                name="Neutral losses"
                :help="NeutralLossesHelp"
                :value="value?.neutralLosses"
                :error="error && error.neutralLosses"
                :multiple-limit="MAX_NEUTRAL_LOSSES"
                :normalize-input="normalizeNeutralLoss"
                @input="(val) => onInput('neutralLosses', val)"
              />
            </el-col>

            <el-col v-if="features.chem_mods" :span="8">
              <form-field
                type="selectMultiWithCreate"
                name="Chemical modifications"
                :help="ChemModsHelp"
                :value="value?.chemMods"
                :error="error && error.chemMods"
                :multiple-limit="MAX_CHEM_MODS"
                :normalize-input="normalizeChemMod"
                @input="(val) => onInput('chemMods', val)"
              />
            </el-col>
            <el-col :span="8">
              <popup-anchor feature-key="v2" placement="top" :show-until="new Date('2022-09-01')" class="block">
                <form-field
                  type="select"
                  name="Analysis version"
                  :help="AnalysisVersionHelp"
                  :value="value?.analysisVersion"
                  :error="error && error.analysisVersion"
                  :options="analysisVersionOptions"
                  @input="(val) => onInput('analysisVersion', val)"
                />
              </popup-anchor>
            </el-col>
          </el-row>
          <el-row :gutter="8">
            <el-col :span="8">
              <form-field
                type="number"
                name="m/z tolerance (ppm)"
                required
                :value="value?.ppm"
                :error="error && error.ppm"
                :help="PpmHelp"
                :min="0.1"
                :step="1"
                :max="50"
                @input="(val) => onInput('ppm', val)"
              />
            </el-col>
            <el-col v-if="features.advanced_ds_config" :span="8">
              <form-field
                type="number"
                name="Isotopic peaks per formula"
                :value="value?.numPeaks"
                :error="error && error.numPeaks"
                is-integer
                :min="2"
                :max="16"
                @input="(val) => onInput('numPeaks', val)"
              />
            </el-col>
            <el-col v-if="features.advanced_ds_config" :span="8">
              <form-field
                type="number"
                name="Decoy adducts per formula"
                :value="value?.decoySampleSize"
                :error="error && error.decoySampleSize"
                is-integer
                :min="1"
                :max="80"
                @input="(val) => onInput('decoySampleSize', val)"
              />
            </el-col>
          </el-row>
          <el-row v-if="features.enrichment" :gutter="8">
            <el-col :span="8">
              <popup-anchor feature-key="v2" placement="top" :show-until="new Date('2022-09-01')" class="block">
                <form-field
                  type="switch"
                  name="LION enrichment"
                  :help="EnrichmentHelp"
                  :value="value?.performEnrichment"
                  :error="error && error.performEnrichment"
                  @input="(val) => onInput('performEnrichment', val)"
                />
              </popup-anchor>
            </el-col>
          </el-row>
        </el-col>
      </el-row>
    </el-form>
  </div>
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
import { ElMessage, ElRow, ElCol, ElForm } from 'element-plus'
import DatabaseHelpLink from '../inputs/DatabaseHelpLink.vue'
import AnalysisVersionHelp from '../inputs/AnalysisVersionHelp.vue'
import EnrichmentHelp from '../inputs/EnrichmentHelp.vue'
import AdductsHelp from '../inputs/AdductsHelp.vue'
import NeutralLossesHelp from '../inputs/NeutralLossesHelp.vue'
import PpmHelp from '../inputs/PpmHelp.vue'
import ChemModsHelp from '../inputs/ChemModsHelp.vue'
import { MAX_CHEM_MODS, MAX_NEUTRAL_LOSSES } from '../../../lib/constants'

export default defineComponent({
  name: 'MetaspaceOptionsSection',
  components: {
    FormField,
    PopupAnchor,
    ElRow,
    ElCol,
    ElForm,
  },
  props: {
    value: { type: Object as PropType<MetaspaceOptions>, required: true },
    error: { type: Object as any, default: () => ({}) },
    databasesByGroup: { type: Array as PropType<MolDBsByGroup[]>, required: true },
    defaultDb: { type: Object as PropType<MolecularDB | null>, required: true },
    adductOptions: { type: Array as PropType<{ value: string; label: string }[]>, required: true },
    scoringModels: { type: Array as PropType<{ name: string }[]>, required: true },
    isNewDataset: { type: Boolean, required: true },
  },
  setup(props, { emit }) {
    const features = config.features
    const maxMolDBs = ref(limits.maxMolDBs)
    const neutralLossOptions = ref([])
    const chemModOptions = ref([])

    const analysisVersionOptions = computed(() => [
      { value: 1, label: 'v1 (Original MSM)' },
      { value: 3, label: 'v2.20230517 (METASPACE-ML)' },
    ])

    const scoringModelOptions = computed(() => [
      // FormField doesn't support nulls - using empty string instead, but it needs to be converted to/from null
      { value: '', label: 'None' },
      ...(props.scoringModels ?? []).map((m: any) => ({ value: m.name, label: m.name })),
    ])
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

    const onDbRemoval = (val: any) => {
      if (props.defaultDb && val === props.defaultDb.id) {
        ElMessage({
          message: `${props.defaultDb.group?.shortName || 'METASPACE'}
        ${formatDatabaseLabel(props.defaultDb)} is the default database and It can not be removed.`,
        })
        onInput('databaseIds', props.value?.databaseIds)
      }
    }

    const normalizeNeutralLoss = (query: string) => normalizeFormulaModifier(query, '-')
    const normalizeChemMod = (query: string) => normalizeFormulaModifier(query, '+')

    return {
      analysisVersionOptions,
      scoringModelOptions,
      databaseOptions,
      onInput,
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
.example-input {
  background: #eeeeee;
  padding: 2px 8px;
  white-space: nowrap;
}
</style>
