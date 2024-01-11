<template>
  <div
    v-if="isAdmin"
    v-loading="loading"
    class="mx-auto max-w-4xl"
  >
    <el-form label-position="top">
      <el-form-item>
        <el-radio-group class="radio-group-wrapper" v-model="mode">
          <el-radio
            border
            :label="0"
          >
            Enable everything
          </el-radio>
          <el-radio
            border
            :label="1"
          >
            Disable dataset upload/reprocessing
          </el-radio>
          <el-radio
            border
            :label="2"
          >
            Read-only mode
          </el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="Maintenance message (optional)">
        <el-input
          v-model="message"
          style="width: 450px;"
        />
      </el-form-item>
      <el-button
        :type="buttonType"
        :loading="isUpdating"
        @click="handleSubmit"
      >
        {{ buttonText }}
      </el-button>
    </el-form>
  </div>
</template>

<script>
import {defineComponent, ref, computed, onMounted, inject} from 'vue';
import {useQuery, DefaultApolloClient} from '@vue/apollo-composable';
import { getSystemHealthQuery, getSystemHealthSubscribeToMore, updateSystemHealthMutation } from '../../api/system';
import { currentUserRoleQuery } from '../../api/user';
import {ElButton, ElForm, ElFormItem, ElInput, ElLoading, ElRadio, ElRadioGroup} from 'element-plus';
export default defineComponent({
  name: 'SystemHealthPage',
  components: {
    ElButton,
    ElForm,
    ElFormItem,
    ElInput,
    ElRadio,
    ElRadioGroup,
  },
  directives: {
    'loading': ElLoading.directive,
  },
  setup() {
    const apolloClient = inject(DefaultApolloClient);

    const mode = ref(0);
    const message = ref('');
    const loading = ref(0);
    const isUpdating = ref(false);
    const buttonType = ref('primary');
    const buttonText = ref('Update');

    const { result: currentUserResult } = useQuery(currentUserRoleQuery, null,
      {fetchPolicy: 'cache-first'});
    const currentUser = computed(() => currentUserResult.value?.currentUser)

    const { result: systemHealthResult, subscribeToMore, onResult: onSystemHealthResult } = useQuery(getSystemHealthQuery);
    const systemHealth = computed(() => systemHealthResult.value?.systemHealth)

    onSystemHealthResult((res) => {
      const { canMutate, canProcessDatasets, message: sysMsg } = res.data?.systemHealth || {}
      mode.value = !canMutate ? 2 : !canProcessDatasets ? 1 : 0
      message.value = sysMsg
    })

    const isAdmin = computed(() => currentUser.value?.role === 'admin');

    const handleSubmit = async () => {
      try {
        isUpdating.value = true;
        await apolloClient.mutate({
          mutation: updateSystemHealthMutation,
          variables: {
            health: {
              canMutate: mode.value < 2,
              canProcessDatasets: mode.value < 1,
              message: message.value ? message.value : null,
            },
          },
        })
        buttonType.value = 'success';
        buttonText.value = 'Updated';
      } catch (err) {
        buttonType.value = 'danger';
        buttonText.value = 'Error';
      } finally {
        isUpdating.value = false;
      }
    };

    onMounted(() => {
      subscribeToMore(getSystemHealthSubscribeToMore);
    });

    return {
      mode,
      message,
      loading,
      isUpdating,
      buttonType,
      buttonText,
      currentUser,
      systemHealth,
      isAdmin,
      handleSubmit,
    };
  },
});
</script>


<style scoped>
  .el-radio {
    display: block;
  }
  .el-radio + .el-radio {
    margin: 5px 0 !important;
  }
  .radio-group-wrapper{
    @apply flex flex-col;
    align-items: flex-start !important;
  }
</style>
