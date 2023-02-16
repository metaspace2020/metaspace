<template>
  <tag-filter
    name="Ontology"
    :removable="false"
    @destroy="destroy"
  >
    <div slot="edit">
      <el-select
        :value="value"
        placeholder="Select ontology"
        filterable
        :clearable="false"
        remote
        @change="val => onChange('ontology', val)"
      >
        <el-option
          v-for="item in (fixedOptions || molClasses)"
          :key="item.id"
          :label="item.name"
          :value="item.id"
        />
      </el-select>
    </div>
    <span
      slot="show"
      class="tf-value-span"
    >
      <span>{{ formatValue() }}</span>
    </span>
  </tag-filter>
</template>

<script lang="ts">
import TagFilter from './TagFilter.vue'
import Vue from 'vue'
import { Component, Prop, Watch } from 'vue-property-decorator'
import gql from 'graphql-tag'
import { EnrichmentDB } from '../../../api/enrichmentdb'

  @Component<OntologyFilter>({
    components: {
      TagFilter,
    },
    apollo: {
      molClasses: {
        query: gql`query EnrichmentDatabases {
          allEnrichmentDatabases {
            id
            name
          }
        }`,
        update: data => data.allEnrichmentDatabases,
      },
    },
  })
export default class OntologyFilter extends Vue {
    @Prop()
    value: any;

    @Prop()
    fixedOptions!: any | undefined;

    molClasses!: EnrichmentDB[];
    termOptionsLoading = 0;

    get filterLists() {
      return this.$store.state.filterLists || {
        adducts: [],
      }
    }

    formatValue() {
      const ontology = parseInt(this.value, 10)
      const molClasses = (this.fixedOptions || this.molClasses || [])
      const classItem = molClasses.find((item: any) => item.id === ontology)

      if (classItem) {
        return classItem.name
      } else {
        return '(Any)'
      }
    }

    onChange(filterKey: 'ontology', val: any) {
      if (val) {
        this.$emit('change', val, filterKey)
      } else {
        this.$emit('destroy', filterKey)
      }
    }

    destroy(): void {
      this.$emit('destroy', 'ontology')
    }
}
</script>
<style scoped>
  .el-select {
    width: 100%;
  }
</style>
