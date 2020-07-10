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
              <form-field
                type="selectMulti"
                name="Metabolite database"
                :help="dbHelp"
                :value="value.databaseIds"
                :error="error && error.databaseIds"
                :options="databaseOptions"
                :multiple-limit="MAX_MOL_DBS"
                required
                @input="val => onInput('databaseIds', val)"
              />
            </el-col>
            <el-col :span="8">
              <form-field
                type="selectMulti"
                name="Adducts"
                :value="value.adducts"
                :error="error && error.adducts"
                :options="adductOptions"
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
              <el-form-item
                class="md-form-field"
                :class="{'is-error': error && error.neutralLosses}"
              >
                <span
                  slot="label"
                  class="field-label"
                >
                  <span>Neutral losses</span>
                  <el-popover
                    trigger="hover"
                    placement="right"
                  >
                    <div style="max-width: 500px;">
                      <p>
                        Search for ions with a specific neutral loss by entering the formula of the loss here,
                        e.g. <span class="example-input">-H2O</span> to search for ions with H2O loss.
                      </p>
                      <p v-if="!features.neutral_losses_new_ds">
                        This functionality is only intended for diagnosis when specific expected molecules
                        were not found in a regular search. It may not be available until after the initial annotation has run.
                      </p>
                    </div>
                    <i
                      slot="reference"
                      class="el-icon-question metadata-help-icon"
                    />
                  </el-popover>
                </span>
                <el-select
                  class="md-ac"
                  :disabled="!features.advanced_ds_config && !features.neutral_losses_new_ds && isNewDataset"
                  :value="value.neutralLosses"
                  multiple
                  filterable
                  default-first-option
                  remote
                  :multiple-limit="MAX_NEUTRAL_LOSSES"
                  no-data-text="Please enter a valid molecular formula"
                  :remote-method="updateNeutralLossOptions"
                  :loading="false"
                  @input="val => onInput('neutralLosses', val)"
                >
                  <el-option
                    v-for="opt in neutralLossOptions"
                    :key="opt"
                    :value="opt"
                    :label="opt"
                  />
                </el-select>
                <span
                  v-if="error && error.neutralLosses"
                  class="error-msg"
                >{{ error.neutralLosses }}</span>
              </el-form-item>
            </el-col>

            <el-col
              v-if="features.chem_mods"
              :span="8"
            >
              <el-form-item
                class="md-form-field"
                :class="{'is-error': error && error.chemMods}"
              >
                <span
                  slot="label"
                  class="field-label"
                >
                  <span>Chemical modifications</span>
                  <el-popover
                    trigger="hover"
                    placement="right"
                  >
                    <div style="max-width: 500px;">
                      <p>
                        Search for ions that have had been chemically modified. For example, on a sample that has been
                        treated with a hydroxylating agent, <span class="example-input">-CH+COH</span> would attempt
                        to find annotations for known molecules with the mass of an additional oxygen atom.
                      </p>
                      <p>
                        This setting should only be used for samples that have been intentionally chemically treated.
                      </p>
                    </div>
                    <i
                      slot="reference"
                      class="el-icon-question metadata-help-icon"
                    />
                  </el-popover>
                </span>
                <el-select
                  class="md-ac"
                  :value="value.chemMods"
                  :multiple-limit="MAX_CHEM_MODS"
                  multiple
                  filterable
                  default-first-option
                  remote
                  no-data-text="Please enter a valid molecular formula"
                  :remote-method="updateChemModOptions"
                  :loading="false"
                  @input="val => onInput('chemMods', val)"
                >
                  <el-option
                    v-for="opt in chemModOptions"
                    :key="opt"
                    :value="opt"
                    :label="opt"
                  />
                </el-select>
                <span
                  v-if="error && error.chemMods"
                  class="error-msg"
                >{{ error.chemMods }}</span>
              </el-form-item>
            </el-col>
            <el-col
              v-if="features.advanced_ds_config"
              :span="8"
            >
              <form-field
                type="select"
                name="Analysis version"
                :help="AnalysisVersionHelp"
                :value="value.analysisVersion"
                :error="error && error.analysisVersion"
                :options="ANALYSIS_VERSION_OPTIONS"
                @input="val => onInput('analysisVersion', val)"
              />
            </el-col>
          </el-row>
          <el-row
            v-if="features.advanced_ds_config"
            :gutter="8"
          >
            <el-col :span="8">
              <form-field
                type="number"
                name="m/z tolerance (ppm)"
                :value="value.ppm"
                :error="error && error.ppm"
                :min="0.01"
                :max="10"
                @input="val => onInput('ppm', val)"
              />
            </el-col>
            <el-col :span="8">
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
            <el-col :span="8">
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
        </el-col>
      </el-row>
    </el-form>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import { Component, Prop } from 'vue-property-decorator'
import FormField from '../inputs/FormField.vue'
import DatabaseDescriptions from '../inputs/DatabaseDescriptions.vue'
import AnalysisVersionHelp from '../inputs/AnalysisVersionHelp.vue'
import { MetaspaceOptions } from '../formStructure'
import { MAX_MOL_DBS, MAX_NEUTRAL_LOSSES, MAX_CHEM_MODS } from '../../../lib/constants'
import config from '../../../lib/config'
import { formatDatabaseLabel } from '../../MolecularDatabases/formatting'

import './FormSection.scss'

const normalizeFormulaModifier = (formula: string, defaultSign: '+'|'-') => {
  if (!formula) return null
  // It won't work for all situations, but for lazy users convert "h2o" to "H2O"
  if (formula === formula.toLowerCase()) {
    formula = formula.toUpperCase()
  }
  if (!formula.startsWith('-') && !formula.startsWith('+')) {
    formula = defaultSign + formula
  }
  const match = /^([+-]?[A-Z][a-z]*[0-9]*)+$/.exec(formula)
  return match != null ? match[0] : null
}

  @Component({
    components: {
      FormField,
    },
  })
export default class MetaspaceOptionsSection extends Vue {
    @Prop({ type: Object, required: true })
    value!: MetaspaceOptions;

    @Prop({ type: Object })
    error?: Record<string, any>;

    @Prop({ type: Array, required: true })
    molDBOptions!: { id: number, name: string, version?: string }[];

    @Prop({ type: Array, required: true })
    adductOptions!: {value: string, label: string}[];

    @Prop({ type: Boolean, required: true })
    isNewDataset!: boolean;

    features = config.features;
    dbHelp = DatabaseDescriptions;
    AnalysisVersionHelp = AnalysisVersionHelp;
    MAX_MOL_DBS = MAX_MOL_DBS;
    MAX_NEUTRAL_LOSSES = MAX_NEUTRAL_LOSSES;
    MAX_CHEM_MODS = MAX_CHEM_MODS;
    ANALYSIS_VERSION_OPTIONS = [
      { value: 1, label: 'v1 (Stable)' },
      { value: 2, label: 'v2 (Development)' },
    ];

    neutralLossOptions: string[] = [];
    chemModOptions: string[] = [];

    get databaseOptions() {
      return this.molDBOptions.map(db => ({
        value: db.id,
        label: formatDatabaseLabel(db),
      }))
    }

    onInput<TKey extends keyof MetaspaceOptions>(field: TKey, val: MetaspaceOptions[TKey]) {
      this.$emit('input', { ...this.value, [field]: val })
    }

    updateNeutralLossOptions(query: string) {
      const formula = normalizeFormulaModifier(query, '-')
      this.neutralLossOptions = formula ? [formula] : []
    }

    updateChemModOptions(query: string) {
      const formula = normalizeFormulaModifier(query, '-')
      this.chemModOptions = formula ? [formula] : []
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
