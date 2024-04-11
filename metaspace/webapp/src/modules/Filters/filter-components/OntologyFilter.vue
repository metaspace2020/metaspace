<template>
  <tag-filter name="Ontology" removable @destroy="destroy">
    <template v-slot:edit>
      <el-select
        :model-value="modelValue"
        placeholder="Select ontology"
        filterable
        clearable
        :teleported="false"
        remote
        @change="(val) => onChange('ontology', val)"
      >
        <el-option v-for="item in fixedOptions || molClasses" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
    </template>
    <template v-slot:show>
      <span class="tf-value-span">
        <span>{{ formatValue() }}</span>
      </span>
    </template>
  </tag-filter>
</template>

<script lang="ts">
import { defineComponent, ref, computed } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import gql from 'graphql-tag'
import TagFilter from './TagFilter.vue'
import { useStore } from 'vuex'

export default defineComponent({
  name: 'OntologyFilter',
  components: {
    TagFilter,
  },
  props: {
    modelValue: Object as any,
    fixedOptions: Array as any,
  },
  setup(props, { emit }) {
    const store = useStore()

    const ENRICHMENT_DATABASES_QUERY = gql`
      query EnrichmentDatabases {
        allEnrichmentDatabases {
          id
          name
        }
      }
    `

    const { result: molClassesResult } = useQuery(ENRICHMENT_DATABASES_QUERY)
    const molClasses: any = computed(() => molClassesResult.value?.allEnrichmentDatabases)

    const filterLists = () => {
      return (
        store.state.filterLists || {
          adducts: [],
        }
      )
    }

    const formatValue = () => {
      const ontology = parseInt(props.modelValue, 10)
      const molClassesAux = props.fixedOptions || molClasses.value || []
      const classItem = molClassesAux.find((item: any) => item.id === ontology)
      if (classItem) {
        return classItem.name
      } else {
        return '(Any)'
      }
    }

    const onChange = (filterKey: 'ontology', val: any) => {
      if (val) {
        emit('change', val, filterKey)
      } else {
        emit('destroy', filterKey)
      }
    }

    const destroy = () => {
      emit('destroy', 'ontology')
    }

    return {
      molClasses,
      formatValue,
      onChange,
      destroy,
    }
  },
})
</script>

<style scoped>
.el-select {
  width: 100%;
}
</style>
