// vue-apollo-composables.d.ts
import { Ref } from 'vue'
import { DocumentNode } from 'graphql'
import { UseMutationReturn, UseQueryReturn } from '@vue/apollo-composable'

// Extend or customize the types as needed
declare module '@vue/apollo-composable' {
  // Example of extending useQuery with more specific types
  function useQuery<TData, TVariables>(
    query: DocumentNode,
    variables?: Ref<TVariables> | TVariables
  ): UseQueryReturn<TData, TVariables>

  // Example of extending useMutation with more specific types
  function useMutation<TData, TVariables>(
    mutation: DocumentNode,
    variables?: Ref<TVariables> | TVariables
  ): UseMutationReturn<TData, TVariables>
}
