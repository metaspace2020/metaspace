<template>
  <div class="table-input">
    <el-table
      :data="value"
      highlight-current-row
      :empty-text="placeholder"
      border
      max-height="200"
      @current-change="onSelectRow"
    >
      <el-table-column
        v-for="(field, fieldName) in fields"
        :key="fieldName"
        :label="field.title"
        :prop="fieldName"
      >
        <div slot-scope="scope">
          <el-input-number
            v-if="field.type === 'number' || field.type === 'integer'"
            :value="scope.row[fieldName]"
            style="width: inherit"
            @input="val => onInput(scope.$index, fieldName, val)"
          />
          <el-input
            v-else
            :value="scope.row[fieldName]"
            :placeholder="field.description"
            @input="val => onInput(scope.$index, fieldName, val)"
          />
        </div>
      </el-table-column>
    </el-table>
    <div>
      <el-button
        class="table-btn"
        :disabled="selectedRow == null"
        @click.native.prevent="onRemoveRow"
      >
        Delete row
      </el-button>
      <el-button
        class="table-btn"
        @click.native.prevent="onAddRow"
      >
        Add row
      </el-button>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import { Component, Prop } from 'vue-property-decorator'

import { mapValues } from 'lodash-es'

  @Component({ name: 'table-input' })
export default class TableInput extends Vue {
    @Prop({ type: Array, required: true })
    value!: object[];

    @Prop({ type: Object, required: true })
    fields!: object;

    @Prop(String)
    placeholder?: string;

    selectedRow: number | null = null;

    onInput(row: number, fieldName: string, value: string | number) {
      const updatedItem = {
        ...this.value[row],
        [fieldName]: value,
      }
      const newValue = this.value.slice()
      newValue[row] = updatedItem
      this.$emit('input', newValue)
    }

    onSelectRow(newRow: object | null) {
      if (newRow != null) {
        this.selectedRow = this.value.indexOf(newRow)
      } else {
        this.selectedRow = null
      }
    }

    onAddRow() {
      const newRow = mapValues(this.fields, () => undefined)
      const newValue = [...this.value, newRow]
      this.$emit('input', newValue)
    }

    onRemoveRow() {
      if (this.selectedRow != null) {
        const newValue = this.value.slice()
        newValue.splice(this.selectedRow, 1)
        this.$emit('input', newValue)
      }
    }
}
</script>

<style lang="scss">
  .table-input {
    height: 240px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;

    .el-table__body-wrapper {
      overflow-x: hidden;
    }

    .el-table__empty-block {
      min-height: inherit;
      height: 50px;
    }

    .el-table__empty-text {
      width: 90%;
      color: #B5BCCC;
      line-height: 1.4em;
    }

    .el-table {
      thead tr > th {
        padding-top: 5px;
        padding-bottom: 5px;

        > .cell {
          padding-left: 10px;
          padding-right: 5px;
        }
      }

      table tr > td {
        padding-top: 5px;
        padding-bottom: 5px;
      }
    }
  }

  .table-btn {
    float: right;
    margin-top: 5px;
    margin-left: 5px;
  }
</style>
