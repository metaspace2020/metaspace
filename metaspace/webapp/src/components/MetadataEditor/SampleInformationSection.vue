<template>
  <div class="metadata-section">
    <el-form size="medium"
             label-position="top">

      <el-col :span="6">
        <div>
          <p class="sectionName">Sample information</p>
        </div>
      </el-col>
      <el-col :span="6">
        <form-field
          type="text"
          name="Organism"
          placeholder="Species of organism"
          :value="value.organism"
          @input="val => onInput('org', val)"
          :error="error && error.name"
          required
        />
      </el-col>
      <el-col :span="6">
        <form-field
          type="text"
          name="Organism part"
          placeholder="Part of the organism"
          :value="value.organismPart"
          @input="val => onInput('orgPart', val)"
          :error="error && error.name"
          required
        />
      </el-col>
      <el-col :span="6">
        <form-field
          type="text"
          name="Condition"
          placeholder="Disease state of the organism"
          :value="value.disease"
          @input="val => onInput('disease', val)"
          :error="error && error.name"
          required
        />
      </el-col>
      <el-row>
        <el-col :span="6" :offset="6">
          <form-field
            type="text"
            name="Sample growth condition"
            placeholder="Intervention, treatment group or growth conditions"
            :value="value.sampGrCond"
            @input="val => onInput('sampGrCond', val)"
            :error="error && error.name"
          />
        </el-col>
      </el-row>
    </el-form>
  </div>
</template>

<script lang="ts">
  import Vue from 'vue'
  import { Component, Prop } from 'vue-property-decorator';
  import FormField from './FormField.vue'

  @Component({
    components: {
      FormField
    }
  })

	export default class SampleInformationSection extends Vue {
    @Prop({type: Object, required: true})
    value!: SampleInformation;

		name: "sample-information-section"

    onInput<TKey extends keyof SampleInformationSection>(field: TKey, val: SampleInformationSection[TKey]) {
		  this.$emit('input', {...this.value, [field]: val})
    }
	}
</script>

<style scoped>
.sectionName {
  font-family: Helvetica, sans-serif;
  font-weight: bold;
  margin: 30px 0 0 30px;
  display: block;
  position: relative;
  top: 50%;
  transform: translateY(-50%);
}
</style>