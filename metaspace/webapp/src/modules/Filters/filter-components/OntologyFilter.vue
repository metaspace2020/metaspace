<template>
  <tag-filter name="Ontology" :removable="false" :width="300" @destroy="destroy" @after-leave="onClose">
    <template v-slot:edit>
      <el-select
        :model-value="molType"
        placeholder="Select molecular type"
        filterable
        :teleported="false"
        remote
        @change="(val) => onChange('molType', val)"
      >
        <el-option v-for="item in molTypeOptions" :key="item" :label="item" :value="item" />
      </el-select>
      <el-select
        :model-value="category"
        placeholder="Select category"
        filterable
        :teleported="false"
        remote
        @change="(val) => onChange('category', val)"
      >
        <el-option v-for="item in categoryOptions" :key="item" :label="item" :value="item" />
      </el-select>
      <el-select
        :model-value="ontology"
        placeholder="Select ontology"
        filterable
        :teleported="false"
        :disabled="!category"
        remote
        @change="onInput"
      >
        <el-option v-for="item in ontologyOptions" :key="item.id" :label="item.name" :value="item.id" />
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
import { defineComponent, computed, reactive, toRefs, onMounted } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import gql from 'graphql-tag'
import TagFilter from './TagFilter.vue'
import { uniq } from 'lodash-es'

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
    const state = reactive({
      molType: undefined,
      category: undefined,
      ontology: undefined,
    })

    const ENRICHMENT_DATABASES_QUERY = gql`
      query EnrichmentDatabases {
        allEnrichmentDatabases {
          id
          name
        }
      }
    `

    const { result: molClassesResult } = useQuery(ENRICHMENT_DATABASES_QUERY)
    const rawOptions = computed(() => props.fixedOptions || molClassesResult.value?.allEnrichmentDatabases || [])

    const molTypeOptions = computed(() => {
      return uniq(rawOptions.value.map((item: any) => item.molType))
    })

    const categoryOptions = computed(() => {
      return state.molType
        ? uniq(
            rawOptions.value
              .filter((item: any) => item.molType === state.molType)
              .map((item: any) => item.category)
              .filter((item: any) => item !== null)
          )
        : []
    })

    const ontologyOptions = computed(() => {
      return state.molType
        ? uniq(
            rawOptions.value.filter((item: any) => item.molType === state.molType && item.category == state.category)
          )
        : []
    })

    const onChange = (type, val) => {
      state[type] = val
      if (type === 'molType') {
        state.category = undefined
        state.ontology = undefined
      } else if (type === 'category') {
        state.ontology = undefined
      }
    }

    const formatValue = () => {
      const ontology = parseInt(props.value, 10)
      const molClassesAux = rawOptions.value
      const classItem = molClassesAux.find((item: any) => item.id === ontology)
      if (classItem) {
        return classItem.name
      } else {
        return '(Any)'
      }
    }

    const valueIfKnown = computed(() => {
      const option = props.fixedOptions?.find((item: any) => item.id === parseInt(props.value, 10))
      return props.value && option ? option.id : undefined
    })

    function onInput(val, filterKey = 'ontology') {
      state.ontology = val
      emit('change', val, filterKey)
    }

    const destroy = () => {
      emit('destroy', 'ontology')
    }

    const setOntology = () => {
      if (valueIfKnown.value) {
        const ontology = rawOptions.value.find((item: any) => item.id === valueIfKnown.value)
        state.molType = ontology.molType
        state.category = ontology.category
        state.ontology = valueIfKnown.value
      }
    }

    const onClose = () => {
      setOntology()
    }

    onMounted(() => {
      setOntology()
    })

    return {
      formatValue,
      onInput,
      destroy,
      valueIfKnown,
      rawOptions,
      molTypeOptions,
      onChange,
      onClose,
      categoryOptions,
      ontologyOptions,
      ...toRefs(state),
    }
  },
})
</script>

<style scoped>
.el-select {
  width: 100%;
}
</style>
