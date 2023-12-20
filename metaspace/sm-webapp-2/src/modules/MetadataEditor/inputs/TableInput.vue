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
        <template v-slot="scope">
          <div>
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
        </template>
      </el-table-column>
    </el-table>
    <div>
      <el-button
        class="table-btn"
        :disabled="selectedRow == null"
        @click.prevent="onRemoveRow"
      >
        Delete row
      </el-button>
      <el-button
        class="table-btn"
        @click.prevent="onAddRow"
      >
        Add row
      </el-button>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType, ref } from 'vue';
import { mapValues } from 'lodash-es';
import {ElTable, ElButton, ElTableColumn} from "element-plus";

export default defineComponent({
  name: 'TableInput',
  components: {
    ElTable, ElButton, ElTableColumn
  },
  props: {
    value: {
      type: Array as PropType<object[]>,
      required: true,
    },
    fields: {
      type: Object as any,
      required: true,
    },
    placeholder: String,
  },
  emits: ['input'],
  setup(props, { emit }) {
    const selectedRow = ref<number | null>(null);

    const onInput = (row: number, fieldName: string, value: string | number) => {
      const updatedItem = { ...props.value[row], [fieldName]: value };
      const newValue = props.value.slice();
      newValue[row] = updatedItem;
      emit('input', newValue);
    };

    const onSelectRow = (newRow: object | null) => {
      if (newRow != null) {
        selectedRow.value = props.value.indexOf(newRow);
      } else {
        selectedRow.value = null;
      }
    };

    const onAddRow = () => {
      const newRow = mapValues(props.fields, () => undefined);
      const newValue = [...props.value, newRow];
      emit('input', newValue);
    };

    const onRemoveRow = () => {
      if (selectedRow.value != null) {
        const newValue = props.value.slice();
        newValue.splice(selectedRow.value, 1);
        emit('input', newValue);
      }
    };

    return {
      selectedRow,
      onInput,
      onSelectRow,
      onAddRow,
      onRemoveRow,
    };
  },
});
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
