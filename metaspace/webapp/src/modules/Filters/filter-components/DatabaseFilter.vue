<template>
  <tag-filter
    name="Database"
    :removable="false"
    :width="300"
    @destroy="destroy"
  >
    <el-select
      slot="edit"
      ref="select"
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
          :value="option.value"
          :label="option.label"
        />
      </el-option-group>
    </el-select>
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

import TagFilter from './TagFilter.vue'
import { Option } from './searchableFilterQueries'
import { MolecularDB } from '../../../api/moldb'
import { formatDatabaseLabel, getDatabasesByGroup } from '../../MolecularDatabases/formatting'
import { watch } from '@vue/composition-api'

interface GroupOption {
  label: string
  options: Option[]
}

function mapDBtoOption(db: MolecularDB): Option {
  return {
    value: db.id ? (db.id).toString() : '',
    label: formatDatabaseLabel(db),
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
          group {
            id
          }
        }
        currentUser {
          groups {
            group {
              id
              shortName
            }
          }
        }
      }`,
      update: data =>
        getDatabasesByGroup(
          data.allMolecularDBs,
          data.currentUser ? data.currentUser.groups : [],
        ),
    },
  },
  components: {
    TagFilter,
  },
})
export default class DatabaseFilter extends Vue {
    @Prop()
    value!: string | undefined;

    dbsByGroup: any = null
    options: Record<string, Option> = {};
    groups: GroupOption[] = []
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
      return this.dbsByGroup !== null && this.groups.length > 0
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
