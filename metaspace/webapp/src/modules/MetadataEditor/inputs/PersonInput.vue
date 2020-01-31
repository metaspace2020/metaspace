<template>
  <el-row>
    <el-col
      class="subfield"
      :span="12"
    >
      <el-form-item
        :class="{'is-error': error && error.First_Name}"
        required
      >
        <el-input
          :value="value.First_Name"
          :required="required"
          @input="val =>onInput('First_Name', val)"
        />
        <div class="subfield-label">
          First name
        </div>
        <span
          v-if="error && error.First_Name"
          class="error-msg"
        >{{ error && error.First_Name }}</span>
      </el-form-item>
    </el-col>

    <el-col
      class="subfield"
      :span="12"
    >
      <el-form-item
        :class="{'is-error': error && error.Surname}"
        required
      >
        <el-input
          :value="value.Surname"
          :required="required"
          @input="val =>onInput('Surname', val)"
        />
        <div class="subfield-label">
          Surname
        </div>
        <span
          v-if="error && error.Surname"
          class="error-msg"
        >{{ error && error.Surname }}</span>
      </el-form-item>
    </el-col>

    <el-col
      class="subfield"
      :span="24"
    >
      <el-form-item
        :class="{'is-error': error && error.Email}"
        required
      >
        <el-input
          :value="value.Email"
          :required="required"
          :disabled="disableEmail"
          placeholder="an email address for contact"
          @input="val =>onInput('Email', val)"
        />
        <div class="subfield-label">
          Email
        </div>
        <span
          v-if="error && error.Email"
          class="error-msg"
        >{{ error && error.Email }}</span>
      </el-form-item>
    </el-col>
  </el-row>
</template>

<script lang="ts">
import Vue from 'vue'
import { Component, Prop } from 'vue-property-decorator'
import { FetchSuggestions } from 'element-ui/types/autocomplete'
import { Person } from '../formStructure'

  @Component({ name: 'person-input' })
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
        [fieldName]: value,
      }
      this.$emit('input', newValue)
    }
}
</script>

<style>
</style>
