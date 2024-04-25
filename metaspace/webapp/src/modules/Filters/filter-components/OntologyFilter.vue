<template>
  <tag-filter name="Ontology" :removable="false" :width="300" @destroy="destroy">
    <template v-slot:edit>
      <el-select
        :model-value="valueIfKnown"
        placeholder="Select molecular type"
        filterable
        :teleported="false"
        remote
        @change="onCategoInput"
      >
        <el-option v-for="item in molTypeOptions" :key="item" :label="item" :value="item" />
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
import { defineComponent, computed } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import gql from 'graphql-tag'
import TagFilter from './TagFilter.vue'
import {uniq} from "lodash-es";

export default defineComponent({
  name: 'OntologyFilter',
  components: {
    TagFilter,
  },
  props: {
    value: String as any,
    fixedOptions: Array as any,
  },
  setup(props, { emit }) {
    const ENRICHMENT_DATABASES_QUERY = gql`
      query EnrichmentDatabases {
        allEnrichmentDatabases {
          id
          name
        }
      }
    `

    const { result: molClassesResult } = useQuery(ENRICHMENT_DATABASES_QUERY)
    const rawOptions = computed(() => props.fixedOptions || molClassesResult.value?.allEnrichmentDatabases)

    const molTypeOptions = computed(() => {
      return uniq((rawOptions.value || []).map((item: any) => item.molType))
    })

    const categoryOptions = computed(() => {
      return uniq((rawOptions.value || []).map((item: any) => item.category))
    })

    const formatValue = () => {
      const ontology = parseInt(props.value, 10)
      const molClassesAux = rawOptions.value || []
      const classItem = molClassesAux.find((item: any) => item.id === ontology)
      if (classItem) {
        return classItem.name
      } else {
        return '(Any)'
      }
    }

    const valueIfKnown = computed(() => {
      const option = props.fixedOptions?.find((item: any) => item.id === parseInt(props.value, 10))
      return props.value && option ? option : undefined
    })

    function onInput(val: string, filterKey: string = 'ontology') {
      emit('change', val, filterKey)
    }

    const destroy = () => {
      emit('destroy', 'ontology')
    }

    return {
      formatValue,
      onInput,
      destroy,
      valueIfKnown,
      rawOptions,
      molTypeOptions,
    }
  },
})
</script>

<style scoped>
.el-select {
  width: 100%;
}
</style>
