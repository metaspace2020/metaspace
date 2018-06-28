<template>
  <el-row>
    <el-col class="subfield" :span="12">
      <el-form-item :class="{'is-error': error && error.First_Name}" required>
        <el-input
          @input="val =>onInput('First_Name', val)"
          :value="value.First_Name"
          :required="required"
        />
        <div class="subfield-label">First name</div>
        <span class="error-msg" v-if="error && error.First_Name">{{ error && error.First_Name }}</span>
      </el-form-item>
    </el-col>

    <el-col class="subfield" :span="12">
      <el-form-item :class="{'is-error': error && error.Surname}" required>
        <el-input
          @input="val =>onInput('Surname', val)"
          :value="value.Surname"
          :required="required"
        />
        <div class="subfield-label">Surname</div>
        <span class="error-msg" v-if="error && error.Surname">{{ error && error.Surname }}</span>
      </el-form-item>
    </el-col>

    <el-col class="subfield" :span="24">
      <el-form-item :class="{'is-error': error && error.Email}" required>
        <el-input
          @input="val =>onInput('Email', val)"
          :value="value.Email"
          :required="required"
          :disabled="disableEmail"
          placeholder="an email address for contact"
        />
        <div class="subfield-label">Email</div>
        <span class="error-msg" v-if="error && error.Email">{{ error && error.Email }}</span>
      </el-form-item>
    </el-col>
  </el-row>
</template>

<script lang="ts">
  import Vue from 'vue';
  import { Component, Prop } from 'vue-property-decorator';
  import { FetchSuggestions } from 'element-ui/types/autocomplete';
  import {Person} from './formStructure';

  @Component({name: 'person-input'})
  export default class PersonInput extends Vue {
    @Prop(Object)
    value!: Person;

    @Prop(Object)
    error!: Record<keyof Person, string>;

    @Prop({ type: Boolean, default: false })
    required!: boolean;

    @Prop({ type: Function, required: true })
    fetchSuggestions!: FetchSuggestions;

    @Prop(Boolean)
    disableEmail?: boolean;

    onInput(fieldName: keyof Person, value: string) {
      const newValue = {
        ...this.value,
        [fieldName]: value
      };
      this.$emit('input', newValue);
    };
  }
</script>

<style>
</style>
