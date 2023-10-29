import { computed, defineComponent } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import gql from 'graphql-tag'

export default defineComponent<any>({
  name: 'GroupsListItem',
  setup: function(props: any) {
    const { result, loading, error } = useQuery(
      gql`
        query GetPosts {
          colocalizationAlgos {id, name}
        }
      `,
    )

    return () => {
      console.log('result', result.value?.colocalizationAlgos[0].name)
      console.log('loading', loading.value)
      return (
        <div class='group-item'>
         Hey
        </div>
      )
    }
  },
})
