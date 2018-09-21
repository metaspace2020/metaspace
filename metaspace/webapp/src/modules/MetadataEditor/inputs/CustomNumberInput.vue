<template>
  <div class="el-input el-input--medium">
    <input
      class="el-input__inner"
      :value="stringValue"
      @input="updateVal"
      required
      type="text" />
  </div>
</template>

<script lang="ts">
  import Vue from 'vue'
  import {Component, Prop, Watch} from 'vue-property-decorator'

  @Component
  export default class CustomNumberInput extends Vue {

    @Prop({default: 0})
    value!: number;

    @Prop({type: Boolean, default: false})
    isInteger!: boolean;

    @Prop({type: Boolean, default: false})
    required!: boolean;

    lastEmittedValue: number | null = null;
    stringValue: string = '';

    created() {
      this.setStringValueFromValue();
    }

    @Watch('value')
    setStringValueFromValue() {
      if (this.value !== this.lastEmittedValue) {
        if (typeof this.value !== 'number' || isNaN(this.value)) {
          this.stringValue = '';
        } else {
          this.stringValue = this.value.toString();
        }
      }
    }

    updateVal(event: Event) {
      const input = event.currentTarget as HTMLInputElement;
      const val = input.value;
      const numericPartOfString = this.isInteger ? /-?[0-9]*/.exec(val) : /-?[0-9]*(\.[0-9]?)?/.exec(val);
      this.stringValue = numericPartOfString == null ? '' : numericPartOfString[0];
      if (val === '' || val === '-') {
        this.lastEmittedValue = null;
        this.$emit('input', null);
      } else if (numericPartOfString != null && numericPartOfString[0] !== '.') {
        const numberValue = parseFloat(numericPartOfString[0]);
        this.lastEmittedValue = numberValue;
        this.$emit('input', numberValue);
      }
      // WORKAROUND: Eagerly update the input element because normally Vue waits a tick before syncing,
      // which means invalid characters appear temporarily.
      input.value = this.stringValue;
    }
  }
</script>
