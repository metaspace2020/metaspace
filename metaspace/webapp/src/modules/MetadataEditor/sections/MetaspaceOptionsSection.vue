<template>
  <div class="metadata-section">
    <el-form
      size="medium"
      label-position="top"
    >
      <el-row>
        <el-col :span="6">
          <div class="metadata-section__title">
            Annotation settings
          </div>
        </el-col>
        <el-col :span="18">
          <el-row :gutter="8">
            <el-col :span="8">
              <popup-anchor
                feature-key="uploadCustomDatabases"
                placement="top"
                class="block"
              >
                <form-field
                  type="selectMulti"
                  name="Metabolite database"
                  :help="dbHelp"
                  :value="value.databaseIds"
                  :error="error && error.databaseIds"
                  :multiple-limit="maxMolDBs"
                  required
                  @remove-tag="onDbRemoval"
                  @input="val => onInput('databaseIds', val)"
                >
                  <el-option-group
                    v-for="group in databaseOptions"
                    slot="options"
                    :key="group.label"
                    :label="group.label"
                  >
                    <el-option
                      v-for="option in group.options"
                      :key="option.value"
                      :value="option.value"
                      :label="option.label"
                    />
                  </el-option-group>
                </form-field>
              </popup-anchor>
            </el-col>
            <el-col :span="8">
              <form-field
                type="selectMulti"
                name="Adducts"
                :value="value.adducts"
                :error="error && error.adducts"
                :options="adductOptions"
                :help="AdductsHelp"
                required
                @input="val => onInput('adducts', val)"
              />
            </el-col>
            <el-col :span="8">
              <form-field
                type="text"
                name="Dataset name"
                placeholder="Dataset name"
                :value="value.name"
                :error="error && error.name"
                required
                @input="val => onInput('name', val)"
              />
            </el-col>
          </el-row>
          <el-row
            v-if="features.neutral_losses || features.chem_mods || features.advanced_ds_config"
            :gutter="8"
          >
            <el-col
              v-if="features.neutral_losses"
              :span="8"
            >
              <form-field
                type="selectMultiWithCreate"
                name="Neutral losses"
                :help="NeutralLossesHelp"
                :value="value.neutralLosses"
                :error="error && error.neutralLosses"
                :multiple-limit="MAX_NEUTRAL_LOSSES"
                :normalize-input="normalizeNeutralLoss"
                @input="val => onInput('neutralLosses', val)"
              />
            </el-col>

            <el-col
              v-if="features.chem_mods"
              :span="8"
            >
              <form-field
                type="selectMultiWithCreate"
                name="Chemical modifications"
                :help="ChemModsHelp"
                :value="value.chemMods"
                :error="error && error.chemMods"
                :multiple-limit="MAX_CHEM_MODS"
                :normalize-input="normalizeChemMod"
                @input="val => onInput('chemMods', val)"
              />
            </el-col>
            <el-col
              :span="8"
            >
              <popup-anchor
                feature-key="v2"
                placement="top"
                :show-until="new Date('2022-09-01')"
                class="block"
              >
                <form-field
                  type="select"
                  name="Analysis version"
                  :help="AnalysisVersionHelp"
                  :value="value.analysisVersion"
                  :error="error && error.analysisVersion"
                  :options="analysisVersionOptions"
                  @input="val => onInput('analysisVersion', val)"
                />
              </popup-anchor>
            </el-col>
          </el-row>
          <el-row
            :gutter="8"
          >
            <el-col :span="8">
              <form-field
                type="number"
                name="m/z tolerance (ppm)"
                required
                :value="value.ppm"
                :error="error && error.ppm"
                :help="PpmHelp"
                :min="0.1"
                :step="1"
                :max="50"
                @input="val => onInput('ppm', val)"
              />
            </el-col>
            <el-col
              v-if="features.advanced_ds_config"
              :span="8"
            >
              <form-field
                type="number"
                name="Isotopic peaks per formula"
                :value="value.numPeaks"
                :error="error && error.numPeaks"
                is-integer
                :min="2"
                :max="16"
                @input="val => onInput('numPeaks', val)"
              />
            </el-col>
            <el-col
              v-if="features.advanced_ds_config"
              :span="8"
            >
              <form-field
                type="number"
                name="Decoy adducts per formula"
                :value="value.decoySampleSize"
                :error="error && error.decoySampleSize"
                is-integer
                :min="1"
                :max="80"
                @input="val => onInput('decoySampleSize', val)"
              />
            </el-col>
          </el-row>
          <el-row
            v-if="features.enrichment"
            :gutter="8"
          >
            <el-col :span="8">
              <popup-anchor
                feature-key="v2"
                placement="top"
                :show-until="new Date('2022-09-01')"
                class="block"
              >
                <form-field
                  type="switch"
                  name="LION enrichment"
                  :help="EnrichmentHelp"
                  :value="value.performEnrichment"
                  :error="error && error.performEnrichment"
                  @input="val => onInput('performEnrichment', val)"
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
import Vue from 'vue'
import { Component, Prop } from 'vue-property-decorator'
import FormField from '../inputs/FormField.vue'
import DatabaseHelpLink from '../inputs/DatabaseHelpLink.vue'
import AnalysisVersionHelp from '../inputs/AnalysisVersionHelp.vue'
import EnrichmentHelp from '../inputs/EnrichmentHelp.vue'
import AdductsHelp from '../inputs/AdductsHelp.vue'
import NeutralLossesHelp from '../inputs/NeutralLossesHelp.vue'
import PpmHelp from '../inputs/PpmHelp.vue'
import ChemModsHelp from '../inputs/ChemModsHelp.vue'
import { MetaspaceOptions } from '../formStructure'
import { MAX_CHEM_MODS, MAX_NEUTRAL_LOSSES } from '../../../lib/constants'
import config, { limits } from '../../../lib/config'
import { formatDatabaseLabel, MolDBsByGroup } from '../../MolecularDatabases/formatting'
import { sortBy } from 'lodash-es'
import PopupAnchor from '../../../modules/NewFeaturePopup/PopupAnchor.vue'
import { MolecularDB } from '../../../api/moldb'
import './FormSection.scss'
import { normalizeFormulaModifier } from '../../../lib/normalizeFormulaModifier'

interface Option {
  value: number
  label: string
}

@Component({
  components: {
    FormField,
    PopupAnchor,
  },
})
export default class MetaspaceOptionsSection extends Vue {
    @Prop({ type: Object, required: true })
    value!: MetaspaceOptions;

    @Prop({ type: Object })
    error?: Record<string, any>;

    @Prop({ type: Array, required: true })
    databasesByGroup!: MolDBsByGroup[];

    @Prop({ type: Object, required: true })
    defaultDb!: MolecularDB | null;

    @Prop({ type: Array, required: true })
    adductOptions!: {value: string, label: string}[];

    @Prop({ type: Array, required: true })
    scoringModels!: {name: string}[];

    @Prop({ type: Boolean, required: true })
    isNewDataset!: boolean;

    features = config.features;
    dbHelp = DatabaseHelpLink;
    AnalysisVersionHelp = AnalysisVersionHelp;
    EnrichmentHelp = EnrichmentHelp;
    NeutralLossesHelp = NeutralLossesHelp;
    PpmHelp = PpmHelp;
    ChemModsHelp = ChemModsHelp;
    AdductsHelp = AdductsHelp;
    maxMolDBs = limits.maxMolDBs;
    MAX_NEUTRAL_LOSSES = MAX_NEUTRAL_LOSSES;
    MAX_CHEM_MODS = MAX_CHEM_MODS;

    neutralLossOptions: string[] = [];
    chemModOptions: string[] = [];

    get analysisVersionOptions() {
      return [
        { value: 1, label: 'v1 (Original MSM)' },
        { value: 3, label: 'v2.20230517 (METASPACE-ML)' },
      ]
    }

    get scoringModelOptions() {
      return [
        // FormField doesn't support nulls - using empty string instead, but it needs to be converted to/from null
        { value: '', label: 'None' },
        ...(this.scoringModels ?? []).map((m: any) => ({ value: m.name, label: m.name })),
      ]
    }

    get databaseOptions() {
      return this.databasesByGroup.map(({ shortName, molecularDatabases }) => ({
        label: shortName,
        options: sortBy(
          molecularDatabases.map(db => ({
            value: db.id,
            label: formatDatabaseLabel(db),
          })),
          'label',
        ),
      }))
    }

    onInput<TKey extends keyof MetaspaceOptions>(field: TKey, val: MetaspaceOptions[TKey]) {
      this.$emit('input', { ...this.value, [field]: val })
    }

    onDbRemoval<TKey extends keyof MetaspaceOptions>(val: any) {
      if (this.defaultDb && val === this.defaultDb.id) {
        this.$message({
          message: `${(this.defaultDb.group?.shortName || 'METASPACE')}
        ${formatDatabaseLabel(this.defaultDb)} is the default database and It can not be removed.`,
        })
        this.onInput('databaseIds', this.value.databaseIds)
      }
    }

    normalizeNeutralLoss(query: string) {
      return normalizeFormulaModifier(query, '-')
    }

    normalizeChemMod(query: string) {
      return normalizeFormulaModifier(query, '+')
    }
}
</script>

<style lang="scss">
  //@import './FormSection.scss';
  .example-input {
    background: #EEEEEE;
    padding: 2px 8px;
    white-space: nowrap;
  }

</style>
