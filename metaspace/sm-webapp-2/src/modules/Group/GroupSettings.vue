<template>
  <div class="group-settings">
    <div class="header-row">
      <h2>Group Details</h2>
      <div class="flex-spacer" />

      <div class="header-row-buttons">
        <el-button
          v-if="canEdit && group"
          type="primary"
          :loading="isSaving"
          @click="handleSave"
        >
          Save
        </el-button>
      </div>
    </div>
    <edit-group-form
      ref="editForm"
      :disabled="isSaving || !canEdit"
      :model-value="model"
      class="mt-3 mb-6 v-rhythm-6"
      @update:modelValue="handleUpdate"
    />
    <div
      v-if="group != null"
      style="margin-bottom: 2em"
    >
      <h2>Custom URL</h2>
      <div v-if="canEditUrlSlug">
        <router-link :to="groupUrlRoute">
          {{ groupUrlPrefix }}
        </router-link>
        <input v-model="model.urlSlug">
      </div>
      <div v-if="!canEditUrlSlug && group && group.urlSlug">
        <router-link :to="groupUrlRoute">
          {{ groupUrlPrefix }}<span class="urlSlug">{{ group?.urlSlug }}</span>
        </router-link>
      </div>
      <div v-if="!canEditUrlSlug && group && !group.urlSlug">
        <p>
          <router-link :to="groupUrlRoute">
            {{ groupUrlPrefix }}<span class="urlSlug">{{ group.id }}</span>
          </router-link>
        </p>
        <p><a href="mailto:contact@metaspace2020.eu">Contact us</a> to set up a custom URL to showcase your group.</p>
      </div>
    </div>
    <div v-if="canDelete && group">
      <h2>Delete group</h2>
      <p>
        Please ensure all datasets have been removed before deleting a group.
      </p>
      <div style="text-align: right; margin: 1em 0;">
        <el-button
          type="danger"
          :loading="isDeletingGroup"
          @click="handleDeleteGroup"
        >
          Delete group
        </el-button>
      </div>
    </div>
  </div>
</template>
<script lang="ts">
import {defineComponent, ref, watch, computed, inject, reactive} from 'vue';
import EditGroupForm from './EditGroupForm.vue';
import {useQuery, DefaultApolloClient} from '@vue/apollo-composable';
import {
  deleteGroupMutation,
  editGroupQuery,
  updateGroupMutation,
} from '../../api/group'
import {useRoute, useRouter} from 'vue-router';
import { useConfirmAsync } from '../../components/ConfirmAsync'
import reportError from '../../lib/reportError';
import { currentUserRoleQuery } from '../../api/user'
import {ElMessage} from "element-plus";
import { parseValidationErrors } from '../../api/validation';

export default defineComponent({
  components: {
    EditGroupForm,
  },
  props: {
    groupId: String
  },
  setup(props) {
    const route = useRoute()
    const router = useRouter()
    const apolloClient = inject(DefaultApolloClient);

    const editForm = ref(null);
    const model = reactive({
      name: '',
      shortName: '',
      urlSlug: ''
    });
    const errors = ref<any>({});
    const isDeletingGroup = ref(false);
    const isSaving = ref(false);
    const confirmAsync = useConfirmAsync();

    const { result: currentUserResult } = useQuery(currentUserRoleQuery, null,{
      fetchPolicy: 'cache-first'
    });
    const currentUser = computed(() => currentUserResult.value?.currentUser);

    const { result: groupResult, loading: groupLoading, refetch: refetchGroup } = useQuery(editGroupQuery,
      () => ({ groupId: props.groupId }), {fetchPolicy: 'network-only'});
    const group = computed(() => groupResult.value?.group);

    const canDelete = computed(() => currentUser.value?.role === 'admin');
    const canEdit = computed(() => currentUser.value?.role === 'admin' || group.value?.currentUserRole === 'GROUP_ADMIN');
    const canEditUrlSlug = computed(() => currentUser.value?.role === 'admin');

    const groupName = computed(() => group.value?.name || '');
    const groupUrlRoute = computed(() => ({ name: 'group', params: { groupIdOrSlug: group.value?.urlSlug || group.value?.id || '' } }));
    const groupUrlPrefix = computed(() => {
      const { href } = router.resolve({ name: 'group', params: { groupIdOrSlug: 'REMOVE' } }, undefined);
      return location.origin + href.replace('REMOVE', '');
    });

    const handleUpdate = (newModel) => {
      Object.assign(model, newModel);
    };

    watch(group, (newGroup) => {
      if (newGroup) {
        model.name = newGroup.name || '';
        model.shortName = newGroup.shortName || '';
        model.urlSlug = newGroup.urlSlug || '';
      }
    });

    const handleDeleteGroup = async () => {
      const confirmOptions = {
        message: `Are you sure you want to delete ${groupName.value}?`,
        confirmButtonText: 'Delete group',
        confirmButtonLoadingText: 'Deleting...',
      };

      await confirmAsync(confirmOptions, async () => {
        isDeletingGroup.value = true
        try {
          await apolloClient.mutate({
            mutation: deleteGroupMutation,
            variables: { groupId: props.groupId },
          })
          ElMessage({ message: `${groupName.value} has been deleted`, type: 'success' })
          await router.push('/')
        } catch (err) {
          reportError(err)
        } finally {
          isDeletingGroup.value = false
        }
      });
    };

    const handleSave = async () => {
      errors.value = {}
      isSaving.value = true
      try {
        await editForm.value.validate()
        const { name, shortName, urlSlug } = model
        await apolloClient.mutate({
          mutation: updateGroupMutation,
          variables: {
            groupId: props.groupId,
            groupDetails: {
              name,
              shortName,
              // Avoid sending a null urlSlug unless it's being intentionally unset
              ...(canEditUrlSlug.value ? { urlSlug: urlSlug || null } : {}),
            },
          },
        })

        ElMessage({ message: `${name} has been saved`, type: 'success' })
        if (canEditUrlSlug.value) {
         await router.replace({
            params: { groupIdOrSlug: urlSlug || props.groupId },
            query: route.query,
          })
        }
      } catch (err) {
        if (err !== false) { // false is the project validation form
          try {
            errors.value = parseValidationErrors(err)
          } finally {
            reportError(err)
          }
        }
      } finally {
        isSaving.value = false
      }
    }

    const refreshData = async () => {
      await refetchGroup();
    };




    return {
      groupLoading,
      isDeletingGroup,
      isSaving,
      model,
      currentUser,
      group,
      canDelete,
      canEdit,
      canEditUrlSlug,
      groupName,
      groupUrlRoute,
      groupUrlPrefix,
      handleDeleteGroup,
      handleSave,
      refreshData,
      editForm,
      handleUpdate,
    };
  }
});
</script>

<style scoped lang="scss">
  .group-settings {
    width: 950px;
    min-height: 80vh; // Ensure there's space for the loading spinner before is visible
  }

  .header-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
  }

  .header-row-buttons {
    display: flex;
    margin-right: 3px;
  }

  .flex-spacer {
    flex-grow: 1;
  }

  .urlSlug {
    padding: 4px 0;
    background-color: #EEEEEE;
  }

</style>
