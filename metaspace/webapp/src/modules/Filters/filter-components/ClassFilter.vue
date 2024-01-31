<template>
  <tag-filter
    name="Class"
    removable
    @destroy="destroy"
  >
    <div slot="edit">
      <el-select
        :value="filterValues.molClass ? parseInt(filterValues.molClass, 10) : undefined"
        placeholder="Select molecular ontology"
        filterable
        clearable
        remote
        @change="val => onChange('molClass', val)"
      >
        <el-option
          v-for="item in molClasses"
          :key="item.id"
          :label="item.name"
          :value="item.id"
        />
      </el-select>
      <el-select
        :value="filterValues.term ? parseInt(filterValues.term, 10) : undefined"
        :remote-method="updateTermQuery"
        :loading="termOptionsLoading !== 0"
        placeholder="Select term"
        filterable
        clearable
        remote
        @focus="() => updateTermQuery('')"
        @change="val => onChange('term', val)"
      >
        <el-option
          v-for="item in termOptions"
          :key="item.id"
          :label="item.enrichmentName"
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
import { Component, Prop } from 'vue-property-decorator'
import config from '../../../lib/config'
import {
  AdductSuggestion,
  ChemModSuggestion,
  chemModSuggestionQuery,
  NeutralLossSuggestion, neutralLossSuggestionQuery,
} from '../../../api/metadata'
import gql from 'graphql-tag'
import { getDatabasesByGroup } from '../../MolecularDatabases/formatting'
import { EnrichmentDB, EnrichmentTerm } from '../../../api/enrichmentdb'

  @Component<ClassFilter>({
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
      termOptions: {
        query: gql`query EnrichmentTerms($databaseId: Int, $id: Int, $enrichmentName: String) {
          allEnrichmentTerms(databaseId: $databaseId, id: $id, enrichmentName: $enrichmentName) {
            id
            enrichmentName
          }
        }`,
        fetchPolicy: 'cache-first',
        loadingKey: 'termOptionsLoading',
        variables() {
          return {
            id: this.filterValues.term && !this.termNameQuery ? parseInt(this.filterValues.term, 10) : undefined,
            enrichmentName: this.termNameQuery,
            databaseId: parseInt(this.filterValues.molClass, 10),
          }
        },
        update({ allEnrichmentTerms }: {allEnrichmentTerms: EnrichmentTerm[]}) {
          return allEnrichmentTerms || [{ id: -1, enrichmentName: 'No terms' }]
        },
      },
    },
  })
export default class ClassFilter extends Vue {
    @Prop(Object)
    filterValues: any;

    termNameQuery: string = '';
    molClasses!: EnrichmentDB[];
    termOptions!: EnrichmentTerm[];
    termOptionsLoading = 0;

    get filterLists() {
      return this.$store.state.filterLists || {
        adducts: [],
      }
    }

    updateTermQuery(query: string) {
      this.termNameQuery = query
    }

    formatValue() {
      const { molClass, term } = this.filterValues
      const classItem = (this.molClasses || []).find((item: any) => item.id === parseInt(molClass, 10))
      const termItem = (this.termOptions || []).find((item: any) => item.id === parseInt(term, 10))

      if (classItem && termItem) {
        return `${classItem.name} - ${termItem.enrichmentName}`
      } else if (classItem) {
        return classItem.name
      } else {
        return '(Any)'
      }
    }

    onChange(filterKey: 'molClass' | 'term', val: any) {
      if (val) {
        this.$emit('change', val, filterKey)
      } else {
        this.$emit('destroy', filterKey)
      }
    }

    destroy(): void {
      this.$emit('destroy', 'molClass')
      this.$emit('destroy', 'term')
    }
}
</script>
<style scoped>
  .el-select {
    width: 100%;
  }
</style>
