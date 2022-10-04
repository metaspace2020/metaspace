import { computed, defineComponent, reactive } from '@vue/composition-api'
import './GroupsListItem.scss'
import Vue from 'vue'
import { encodeParams } from '../Filters'
import CopyButton from '../../components/CopyButton.vue'
import { useQuery } from '@vue/apollo-composable'
import { countGroupDatasets, getUserGroupsQuery, ViewGroupResult } from '../../api/group'
import { plural } from '../../lib/vueFilters'

const RouterLink = Vue.component('router-link')

interface GroupListItemProps {
  id: string
  name: string
  shortName: string
  urlSlug: string
  numMembers: number
}

interface GroupListItemState {
  groupNameFilter: string | undefined
}

export default defineComponent<GroupListItemProps>({
  name: 'GroupsListItem',
  props: {
    id: {
      type: String,
    },
    name: {
      type: String,
    },
    shortName: {
      type: String,
    },
    urlSlug: {
      type: String,
    },
    numMembers: {
      type: Number,
    },
  },
  setup: function(props, ctx) {
    const { $route, $store } = ctx.root
    const state = reactive<GroupListItemState>({
      groupNameFilter: '',
    })

    const queryVars = computed(() => ({
      groupId: props.id,
    }))
    const {
      result: countDatasetsResult,
    } = useQuery<Number|any>(countGroupDatasets, queryVars)
    const datasetCount = computed(() => countDatasetsResult.value != null ? countDatasetsResult.value.countDatasets
      : null)

    const groupLink = (id: String, urlSlug: String) => {
      return {
        name: 'group',
        params: { groupIdOrSlug: urlSlug || id },
      }
    }

    const datasetsLink = (id: String) => {
      return {
        path: '/datasets',
        query: encodeParams({ group: id }),
      }
    }

    const managementLink = (id: String, urlSlug: String) => {
      return {
        name: 'group',
        params: { groupIdOrSlug: urlSlug || id },
        query: { tab: 'settings' },
      }
    }

    return () => {
      const { id, name, shortName, urlSlug, numMembers } = props
      const nOfDatasets : number = (datasetCount.value || 0) as unknown as number

      return (
        <div class='group-item'>
          <div class="group-item-info">
            <div class="group-item-title-wrapper group-item-info-line">
              <RouterLink to={groupLink(id, urlSlug)} class='group-item-title'>
                {name}{shortName ? <span class='group-item-short-name'> ({shortName})</span> : ''}
              </RouterLink>
              <CopyButton
                class="ml-1"
                isId
                text={id}>
                Copy group id to clipboard
              </CopyButton>
            </div>
            <div class="group-item-info-line">
              {
                nOfDatasets > 0
                && <RouterLink to={datasetsLink(id)} class='group-item-title'>
                  {plural(nOfDatasets, 'Dataset', 'Datasets')},
                </RouterLink>
              }
              {plural(numMembers, 'Member', 'Members') }
            </div>
          </div>
          <div class="group-item-actions">
            <div>
              <i class="el-icon-picture"/>
              <RouterLink to={datasetsLink(id)} class='ml-1'>
                Browse datasets
              </RouterLink>
            </div>
            <div>
              <i class="el-icon-edit" />
              <RouterLink to={managementLink(id, urlSlug)} class='ml-1'>
                Manage group
              </RouterLink>
            </div>
          </div>
        </div>
      )
    }
  },
})
