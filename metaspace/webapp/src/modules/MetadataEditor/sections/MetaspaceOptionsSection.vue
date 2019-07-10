<template>
  <div class="metadata-section">
    <el-form size="medium"
             label-position="top">
      <el-row>
        <el-col :span="6">
          <div class="metadata-section__title">Annotation settings</div>
        </el-col>
        <el-col :span="18">
          <el-row :gutter="8">
            <el-col :span="8">
              <form-field
                type="selectMulti"
                name="Metabolite database"
                :help="dbHelp"
                :value="value.molDBs"
                @input="val => onInput('molDBs', val)"
                :error="error && error.molDBs"
                :options="molDBOptions"
                :multiple-limit="MAX_MOL_DBS"
                required
              />
            </el-col>
            <el-col :span="8">
              <form-field
                type="selectMulti"
                name="Adducts"
                :value="value.adducts"
                @input="val => onInput('adducts', val)"
                :error="error && error.adducts"
                :options="adductOptions"
                required
              />
            </el-col>
            <el-col :span="8">
              <form-field
                type="text"
                name="Dataset name"
                placeholder="Dataset name"
                :value="value.name"
                @input="val => onInput('name', val)"
                :error="error && error.name"
                required
              />
            </el-col>
          </el-row>
          <el-row :gutter="8" v-if="features.neutral_losses || features.chem_mods || features.advanced_ds_config">
            <el-col :span="8" v-if="features.neutral_losses">
              <el-form-item class="md-form-field" :class="{'is-error': error && error.neutralLosses}">
                <span slot="label" class="field-label">
                  <span>Neutral losses</span>
                  <el-popover trigger="hover" placement="right">
                    <div style="max-width: 500px;">
                      <p>
                        Search for ions with a specific neutral loss by entering the formula of the loss here,
                        e.g. <span class="example-input">-H2O</span> to search for ions with H2O loss.
                      </p>
                      <p>
                        This functionality is only intended for diagnosis when specific expected molecules
                        were not been found in a regular search. It may not be available until after the initial annotation has run.
                      </p>
                    </div>
                    <i slot="reference" class="el-icon-question metadata-help-icon"></i>
                  </el-popover>
                </span>
                <el-select
                  class="md-ac"
                  :disabled="!features.advanced_ds_config && isNewDataset"
                  :value="value.neutralLosses"
                  @input="val => onInput('neutralLosses', val)"
                  multiple filterable default-first-option remote
                  :multiple-limit="MAX_NEUTRAL_LOSSES"
                  no-data-text="Please enter a valid molecular formula"
                  :remote-method="updateNeutralLossOptions"
                  :loading="false"
                >
                  <el-option v-for="opt in neutralLossOptions" :value="opt" :label="opt" :key="opt" />
                </el-select>
                <span class="error-msg" v-if="error && error.neutralLosses">{{ error.neutralLosses }}</span>
              </el-form-item>
            </el-col>

            <el-col :span="8" v-if="features.chem_mods">
              <el-form-item class="md-form-field" :class="{'is-error': error && error.chemMods}">
                <span slot="label" class="field-label">
                  <span>Chemical modifications</span>
                  <el-popover trigger="hover" placement="right">
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
                    <i slot="reference" class="el-icon-question metadata-help-icon"></i>
                  </el-popover>
                </span>
                <el-select
                  class="md-ac"
                  :value="value.chemMods"
                  @input="val => onInput('chemMods', val)"
                  :multiple-limit="MAX_CHEM_MODS"
                  multiple filterable default-first-option remote
                  no-data-text="Please enter a valid molecular formula"
                  :remote-method="updateChemModOptions"
                  :loading="false"
                >
                  <el-option v-for="opt in chemModOptions" :value="opt" :label="opt" :key="opt" />
                </el-select>
                <span class="error-msg" v-if="error && error.chemMods">{{ error.chemMods }}</span>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="8" v-if="features.advanced_ds_config">
            <el-col :span="8">
              <form-field
                type="number"
                name="m/z tolerance (ppm)"
                :value="value.ppm"
                @input="val => onInput('ppm', val)"
                :error="error && error.ppm"
                :min="0.01"
                :max="10"
              />
            </el-col>
            <el-col :span="8">
              <form-field
                type="number"
                name="Isotopic peaks per formula"
                :value="value.numPeaks"
                @input="val => onInput('numPeaks', val)"
                :error="error && error.numPeaks"
                isInteger
                :min="2"
                :max="16"
              />
            </el-col>
            <el-col :span="8">
              <form-field
                type="number"
                name="Decoy adducts per formula"
                :value="value.decoySampleSize"
                @input="val => onInput('decoySampleSize', val)"
                :error="error && error.decoySampleSize"
                isInteger
                :min="1"
                :max="80"
              />
            </el-col>
          </el-row>
        </el-col>
      </el-row>
    </el-form>
  </div>
</template>

<script lang="ts">
  import Vue from 'vue';
  import { Component, Prop } from 'vue-property-decorator';
  import FormField from '../inputs/FormField.vue';
  import DatabaseDescriptions from '../inputs/DatabaseDescriptions.vue';
  import { MetaspaceOptions } from '../formStructure';
  import { MAX_MOL_DBS, MAX_NEUTRAL_LOSSES, MAX_CHEM_MODS } from '../../../lib/constants';
  import config from '../../../config';
  import './FormSection.scss';

  const normalizeFormulaModifier = (formula: string, defaultSign: '+'|'-') => {
    if (!formula) return null;
    // It won't work for all situations, but for lazy users convert "h2o" to "H2O"
    if (formula == formula.toLowerCase()) {
      formula = formula.toUpperCase();
    }
    if (!formula.startsWith('-') && !formula.startsWith('+')) {
      formula = defaultSign + formula;
    }
    const match = /^([+\-]?[A-Z][a-z]*[0-9]*)+$/.exec(formula);
    return match != null ? match[0] : null;
  };

  @Component({
    components: {
      FormField
    },
  })
  export default class MetaspaceOptionsSection extends Vue {
    @Prop({type: Object, required: true })
    value!: MetaspaceOptions;

    @Prop({type: Object })
    error?: Record<string, any>;
    @Prop({type: Array, required: true})
    molDBOptions!: string[];
    @Prop({type: Array, required: true})
    adductOptions!: {value: string, label: string}[];
    @Prop({type: Boolean, required: true})
    isNewDataset!: boolean;

    features = config.features;
    dbHelp = DatabaseDescriptions;
    MAX_MOL_DBS = MAX_MOL_DBS;
    MAX_NEUTRAL_LOSSES = MAX_NEUTRAL_LOSSES;
    MAX_CHEM_MODS = MAX_CHEM_MODS;

    neutralLossOptions: string[] = [];
    chemModOptions: string[] = [];

    onInput<TKey extends keyof MetaspaceOptions>(field: TKey, val: MetaspaceOptions[TKey]) {
      this.$emit('input', {...this.value, [field]: val});
    }

    updateNeutralLossOptions(query: string) {
      const formula = normalizeFormulaModifier(query, '-');
      this.neutralLossOptions = formula ? [formula] : []
    }

    updateChemModOptions(query: string) {
      const formula = normalizeFormulaModifier(query, '-');
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
