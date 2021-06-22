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
                type="selectMulti"
                name="Neutral losses"
                :help="NeutralLossesHelp"
                :value="value.neutralLosses"
                :error="error && error.neutralLosses"
                :multiple-limit="MAX_NEUTRAL_LOSSES"
                popper-class="el-select-popper__free-entry"
                no-data-text="Enter a formula"
                filterable
                allow-create
                default-first-option
                @input="onNeutralLossesInput"
              />
            </el-col>

            <el-col
              v-if="features.chem_mods"
              :span="8"
            >
              <form-field
                type="selectMulti"
                name="Chemical modifications"
                :help="ChemModsHelp"
                :value="value.chemMods"
                :error="error && error.chemMods"
                :multiple-limit="MAX_CHEM_MODS"
                popper-class="el-select-popper__free-entry"
                no-data-text="Enter a formula"
                filterable
                allow-create
                default-first-option
                @input="onChemModsInput"
              />
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
                :max="50"
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
import DatabaseHelpLink from '../inputs/DatabaseHelpLink.vue'
import AnalysisVersionHelp from '../inputs/AnalysisVersionHelp.vue'
import AdductsHelp from '../inputs/AdductsHelp.vue'
import NeutralLossesHelp from '../inputs/NeutralLossesHelp.vue'
import ChemModsHelp from '../inputs/ChemModsHelp.vue'
import { MetaspaceOptions } from '../formStructure'
import { MAX_NEUTRAL_LOSSES, MAX_CHEM_MODS } from '../../../lib/constants'
import config, { limits } from '../../../lib/config'
import { formatDatabaseLabel, MolDBsByGroup } from '../../MolecularDatabases/formatting'
import { sortBy, uniq } from 'lodash-es'
import PopupAnchor from '../../../modules/NewFeaturePopup/PopupAnchor.vue'
import { MolecularDB } from '../../../api/moldb'
import './FormSection.scss'

interface Option {
  value: number
  label: string
}

const validElement = new RegExp(
  '/A[cglmrstu]|B[aeikr]?|C[adelorsu]?|D[by]|E[rsu]|F[er]?|G[ade]|H[efgo]?|I[nr]?|Kr?|L[airu]|M[dgno]|'
  + 'N[abdeip]?|Os?|P[abdmrt]?|R[behu]|S[bceimnr]?|T[abceilm]|U|V|W|Xe|Yb?|Z[nr]',
)
const validFormulaModifier = new RegExp(`([+-]((${validElement.source})[0-9]{0,3})+)+`)
const normalizeFormulaModifier = (formula: string, defaultSign: '+'|'-') => {
  if (!formula) return null
  // It won't work for all situations, but for lazy users convert "h2o" to "H2O"
  if (formula === formula.toLowerCase()) {
    formula = formula.toUpperCase()
  }
  // Tidy & regularize formula as much as possible
  if (!formula.startsWith('-') && !formula.startsWith('+')) {
    formula = defaultSign + formula
  }
  formula = formula.replace(/\s/g, '')
  // If it's not valid after tidying, reject it
  const match = validFormulaModifier.exec(formula)
  return match != null && match[0] === formula ? formula : null
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

    @Prop({ type: Boolean, required: true })
    isNewDataset!: boolean;

    features = config.features;
    dbHelp = DatabaseHelpLink;
    AnalysisVersionHelp = AnalysisVersionHelp;
    NeutralLossesHelp = NeutralLossesHelp;
    ChemModsHelp = ChemModsHelp;
    AdductsHelp = AdductsHelp;
    maxMolDBs = limits.maxMolDBs;
    MAX_NEUTRAL_LOSSES = MAX_NEUTRAL_LOSSES;
    MAX_CHEM_MODS = MAX_CHEM_MODS;
    ANALYSIS_VERSION_OPTIONS = [
      { value: 1, label: 'v1 (Stable)' },
      { value: 2, label: 'v2 (Development)' },
    ];

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

    onNeutralLossesInput(neutralLosses: string[]) {
      const parsedVals: string[] = []
      neutralLosses.forEach(neutralLoss => {
        const parsedVal = normalizeFormulaModifier(neutralLoss, '-')
        if (parsedVal) {
          parsedVals.push(parsedVal)
        } else if (neutralLoss) {
          this.$alert(
            `"${neutralLoss}" was not understood. Neutral losses should be specified as a chemical formula`
            + ' prefixed with -. Group, bond type, isotope and charge notation should not be used.',
            'Invalid neutral loss',
            { type: 'error', lockScroll: false },
          )
        }
      })

      this.onInput('neutralLosses', uniq(parsedVals))
    }

    onChemModsInput(chemMods: string[]) {
      const parsedVals: string[] = []
      chemMods.forEach(chemMod => {
        const parsedVal = normalizeFormulaModifier(chemMod, '+')
        if (parsedVal) {
          parsedVals.push(parsedVal)
        } else if (chemMod) {
          this.$alert(
            `"${chemMod}" was not understood. Chemical modification strings should be one or more chemical formulas,`
            + ' each prefixed with either + or -. Bond type, group, isotope and charge notation should not be used.',
            'Invalid chemical modification',
            { type: 'error', lockScroll: false },
          )
        }
      })

      this.onInput('chemMods', uniq(parsedVals))
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

  .el-select-popper__free-entry .el-select-dropdown__list::after {
    @apply pt-2 px-5 text-center;
    display: list-item;
    content: 'Press enter to confirm';
    // Style to match the no-data-text
    font-size: 14px;
    color: #999;
  }

</style>
