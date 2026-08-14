<template>
  <div class="max-w-2xl mx-auto py-16 px-6 text-center">
    <div v-if="state === 'loading'" v-loading="true" class="h-32" data-testid="beta-activation-loading" />
    <template v-else-if="state === 'success'">
      <h1 class="text-2xl font-medium mb-4">Access activated</h1>
      <p class="mb-8">Your features are now active and available in your account.</p>
      <router-link to="/">Go to the home page</router-link>
    </template>
    <template v-else-if="state === 'already-active'">
      <h1 class="text-2xl font-medium mb-4">Already activated</h1>
      <p class="mb-8">This access link has already been used — your features are active.</p>
      <router-link to="/">Go to the home page</router-link>
    </template>
    <template v-else>
      <h1 class="text-2xl font-medium mb-4">Invalid activation link</h1>
      <p class="mb-8">This link is invalid or has expired. If you believe this is a mistake, please contact us.</p>
      <router-link to="/">Go to the home page</router-link>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useApolloClient, useMutation } from '@vue/apollo-composable'
import { activateBetaTesterMutation, proFeatureWhitelistQuery } from '../../api/plan'

type ActivationState = 'loading' | 'success' | 'already-active' | 'invalid'

const route = useRoute()
const { client } = useApolloClient()
const { mutate: activateBetaTester } = useMutation(activateBetaTesterMutation)
const state = ref<ActivationState>('loading')

onMounted(async () => {
  const token = route.query.token
  if (typeof token !== 'string' || !token) {
    state.value = 'invalid'
    return
  }
  const variables: Record<string, string> = { token }
  // forward optional overrides carried on the emailed link
  for (const key of ['features', 'startDate', 'endDate']) {
    const value = route.query[key]
    if (typeof value === 'string' && value) {
      variables[key] = value
    }
  }
  try {
    const result = await activateBetaTester(variables)
    const outcome = result?.data?.activateBetaTester
    state.value = outcome === 'success' || outcome === 'already-active' ? outcome : 'invalid'
    if (state.value === 'success') {
      // refresh the cached whitelist so gated features unlock without a manual reload
      await client.query({ query: proFeatureWhitelistQuery, fetchPolicy: 'network-only' }).catch(() => undefined)
    }
  } catch {
    state.value = 'invalid'
  }
})
</script>
