<template>
  <tag-filter
    name="Database"
    :removable="false"
    :width="300"
    @destroy="destroy"
  >
    <div
      slot="edit"
    >
      <el-select
        ref="select"
        class="w-full"
        placeholder="Start typing name"
        :clearable="false"
        filterable
        :filter-method="filterOptions"
        no-data-text="No matches"
        no-match-text="No matches"
        reserve-keyword
        :value="valueIfKnown"
        @change="onInput"
        @visible-change="filterOptions('')"
      >
        <el-option-group
          v-for="group in groups"
          :key="group.label"
          :label="group.label"
        >
          <el-option
            v-for="option in group.options"
            :key="option.value"
            class="flex"
            :value="option.value"
            :label="option.label"
          >
            <span
              class="truncate"
              :title="option.label"
            >
              {{ option.label }}
            </span>
            <span
              v-if="option.archived"
              class="text-gray-600 text-xs font-normal uppercase tracking-wide ml-auto"
            >
              Archived
            </span>
          </el-option>
        </el-option-group>
      </el-select>
      <FilterHelpText>
        Search to see archived versions
      </FilterHelpText>
    </div>
    <span
      v-if="initialized"
      slot="show"
      class="tf-value-span"
    >
      {{ label }}
    </span>
    <i
      v-else
      slot="show"
      class="el-icon-loading"
    />
  </tag-filter>
</template>

<script lang="ts">
import Vue from 'vue'
import gql from 'graphql-tag'
import Component from 'vue-class-component'
import { Prop, Watch } from 'vue-property-decorator'
import { sortBy } from 'lodash-es'
import { watch } from '@vue/composition-api'

import TagFilter from './TagFilter.vue'
import { FilterHelpText } from './TagFilterComponents'

import { MolecularDB } from '../../../api/moldb'
import { formatDatabaseLabel, getDatabasesByGroup } from '../../MolecularDatabases/formatting'

interface Option {
  value: string
  label: string
  archived: Boolean
}

interface GroupOption {
  label: string
  options: Option[]
}

function mapDBtoOption(db: MolecularDB): Option {
  return {
    value: db.id ? (db.id).toString() : '',
    label: formatDatabaseLabel(db),
    archived: db.archived,
  }
}

@Component({
  apollo: {
    dbsByGroup: {
      query: gql`query DatabaseOptions {
        allMolecularDBs {
          id
          name
          version
          archived
          group {
            id
            shortName
          }
        }
      }`,
      update: data => getDatabasesByGroup(data.allMolecularDBs),
    },
  },
  components: {
    TagFilter,
    FilterHelpText,
  },
})
export default class DatabaseFilter extends Vue {
    @Prop()
    value!: string | undefined;

    dbsByGroup: any = null
    options: Record<string, Option> = {};
    groups: GroupOption[] | null = []
    previousQuery: string | null = null

    get label() {
      if (this.value === undefined) {
        return '(any)'
      }
      if (this.options[this.value] !== undefined) {
        return this.options[this.value].label
      }
      return '(unknown)'
    }

    get valueIfKnown() {
      if (this.value === undefined || this.options[this.value] === undefined) {
        return undefined
      }
      return this.value
    }

    get initialized() {
      return this.dbsByGroup !== null && this.groups !== null
    }

    @Watch('dbsByGroup')
    initialiseOptions() {
      this.previousQuery = null
      this.options = {}
      this.filterOptions('')
    }

    filterOptions(query: string) {
      if (query === this.previousQuery || this.dbsByGroup === null) {
        return
      }

      const hideArchived = query.length === 0

      try {
        const groupOptions: GroupOption[] = []
        const queryRegex = new RegExp(query, 'i')

        for (const group of this.dbsByGroup) {
          const options: Option[] = []
          for (const db of group.molecularDatabases) {
            const id = db.id.toString()
            if (!(id in this.options)) {
              this.$set(this.options, id, mapDBtoOption(db))
            }
            const option = this.options[id]
            if (hideArchived && db.archived && this.value !== option.value) {
              continue
            }
            if (queryRegex.test(option.label)) {
              options.push(option)
            }
          }
          if (options.length) {
            groupOptions.push({
              label: group.shortName,
              options: sortBy(options, 'label'),
            })
          }
        }

        this.groups = groupOptions
        this.previousQuery = query
      } catch (err) {
        this.groups = []
        this.previousQuery = null
        throw err
      }
    }

    onInput(val: string) {
      this.$emit('input', val)
      this.$emit('change', val)
    }

    destroy() {
      this.$emit('destroy')
    }
}
</script>

<style>
  .el-select-dropdown.is-multiple .el-select-dropdown__wrap {
    max-height: 600px;
  }
</style>
