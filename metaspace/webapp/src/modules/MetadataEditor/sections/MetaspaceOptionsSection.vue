<template>
  <div class="metadata-section">
    <el-row>
      <el-col :span="6">
        <div class="metadata-section__title">Annotation settings</div>
      </el-col>
      <el-col :span="18">
        <el-row :gutter="8">
          <el-form size="medium"
                   label-position="top">

            <el-col :span="8">
              <form-field
                type="selectMulti"
                name="Metabolite database"
                :help="dbHelp"
                :value="value.molDBs"
                @input="val => onInput('molDBs', val)"
                :error="error && error.molDBs"
                :options="molDBOptions"
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
          </el-form>
        </el-row>
      </el-col>
    </el-row>
  </div>
</template>

<script lang="ts">
  import Vue from 'vue';
  import { Component, Prop } from 'vue-property-decorator';
  import FormField from '../inputs/FormField.vue';
  import DatabaseDescriptions from '../inputs/DatabaseDescriptions.vue';
  import { MetaspaceOptions } from '../formStructure';
  import { MAX_MOL_DBS } from '../../../lib/constants';
  import './FormSection.scss';

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
    adductOptions!: string[];

    dbHelp = DatabaseDescriptions;
    MAX_MOL_DBS = MAX_MOL_DBS;

    onInput<TKey extends keyof MetaspaceOptions>(field: TKey, val: MetaspaceOptions[TKey]) {
      this.$emit('input', {...this.value, [field]: val});
    }
  }
</script>

<style lang="scss">
  //@import './FormSection.scss';
</style>
