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
      remote
      :remote-method="fetchOptions"
      filterable
      :loading="loading"
      loading-text="Loading matching entries..."
      no-data-text="No matches"
      no-match-text="No matches"
      reserve-keyword
      :value="value"
      @change="onInput"
      @visible-change="fetchOptions('')"
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
    <i
      v-if="firstLoad"
      slot="show"
      class="el-icon-loading"
    />
    <span
      v-else
      slot="show"
      class="tf-value-span"
    >
      {{ label }}
    </span>
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
  components: {
    TagFilter,
  },
})
export default class DatabaseFilter extends Vue {
    @Prop()
    value!: string | undefined;

    firstLoad = true
    loading = false;
    options: Record<string, Option> = {};
    groups: GroupOption[] = []
    previousQuery: string | null = null

    created() {
      this.fetchOptions('')
        .then(() => { this.firstLoad = false })
    }

    get label() {
      if (this.firstLoad) {
        return ''
      }
      if (this.value === undefined) {
        return '(any)'
      }
      if (this.options[this.value] !== undefined) {
        return this.options[this.value].label
      }
      return '(unknown)'
    }

    async fetchOptions(query: string) {
      if (query === this.previousQuery) return

      this.loading = true

      try {
        const { data } = await this.$apollo.query({
          query: gql`query DatabaseOptions {
            allMolecularDBs(filter: { global: true }) {
              id
              name
              version
            }
            currentUser {
              groups {
                group {
                  id
                  shortName
                  molecularDatabases {
                    id
                    name
                    version
                  }
                }
              }
            }
          }`,
          fetchPolicy: 'cache-first',
        })

        const groups = getDatabasesByGroup(
          data.allMolecularDBs,
          data.currentUser ? data.currentUser.groups : [],
        )

        const groupOptions: GroupOption[] = []
        const queryRegex = new RegExp(query, 'i')

        for (const group of groups) {
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
      } finally {
        this.loading = false
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
