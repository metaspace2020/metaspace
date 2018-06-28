<template>
  <div class="metadata-section">
    <div class="heading">METASPACE options</div>

    <el-form size="medium"
             label-position="top">
      <el-col :span="6">
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
      <el-col :span="6">
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
      <el-col :span="7">
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
  </div>
</template>

<script lang="ts">
  import Vue from 'vue';
  import { Component, Prop } from 'vue-property-decorator';
  import FormField from './FormField.vue';
  import DatabaseDescriptions from '../DatabaseDescriptions.vue';
  import { MetaspaceOptions } from './formStructure';

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

    onInput<TKey extends keyof MetaspaceOptions>(field: TKey, val: MetaspaceOptions[TKey]) {
      this.$emit('input', {...this.value, [field]: val});
    }

  }
</script>

<style lang="scss">
  .metadata-section {
    display: block;
    max-width: 1000px;
    > .heading {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 8px;
    }
  }
</style>
