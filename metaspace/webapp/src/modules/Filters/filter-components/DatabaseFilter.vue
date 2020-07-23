<template>
  <tag-filter
    :name="name"
    :removable="false"
    :width="300"
    @destroy="destroy"
  >
    <el-select
      slot="edit"
      ref="select"
      placeholder="Start typing name"
      remote
      filterable
      :clearable="false"
      :remote-method="fetchOptions"
      :loading="loading"
      loading-text="Loading matching entries..."
      no-match-text="No matches"
      :value="value"
      @change="onInput"
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
      slot="show"
      class="tf-value-span"
    >
      <span v-if="value">
        {{ currentLabel }}
      </span>
      <span v-else>
        (any)
      </span>
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
import { formatDatabaseLabel } from '../../MolecularDatabases/formatting'

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
    @Prop({ type: String, required: true })
    name!: string;

    @Prop()
    value!: string | undefined;

    loading = false;
    options: Record<string, Option> = {};
    groups: GroupOption[] = []

    created() {
      this.fetchOptions('')
    }

    get currentLabel() {
      if (this.value) {
        return this.options[this.value].label
      }
      return ''
    }

    async fetchOptions(query: string) {
      console.log({ query })
      this.loading = true

      try {
        const { data } = await this.$apollo.query({
          query: gql`query DatabaseOptions {
            publicMolecularDBs {
              id
              name
              version
            }
            allGroups {
              id
              shortName
              dbs: molecularDatabases {
                id
                name
                version
              }
            }
          }`,
          fetchPolicy: 'cache-first',
        })

        const groups = [
          { shortName: 'Public', dbs: data.publicMolecularDBs },
          ...sortBy(data.allGroups, 'shortName'),
        ]

        const groupOptions: GroupOption[] = []
        const queryRegex = new RegExp(query, 'i')

        for (const group of groups) {
          const options: Option[] = []
          for (const db of group.dbs) {
            const id = db.id.toString()
            if (!(id in this.options)) {
              this.options[id] = mapDBtoOption(db)
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
        this.loading = false
      } catch (err) {
        this.groups = []
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
