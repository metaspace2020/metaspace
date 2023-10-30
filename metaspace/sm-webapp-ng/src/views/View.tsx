import { defineComponent } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import gql from 'graphql-tag'

interface Props {
  name: string
}

export default defineComponent<Props>({
  name: 'GroupsListItem',
  setup: function() {
    const { result, loading } = useQuery(
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
