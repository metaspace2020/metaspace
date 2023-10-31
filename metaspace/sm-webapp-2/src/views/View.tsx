import { defineComponent } from 'vue'
import { defineAsyncComponent } from 'vue';
import { ElButton } from 'element-plus'
import gql from 'graphql-tag'
import './View.scss'
import {useQuery} from "@vue/apollo-composable";
import {ElNotification} from "element-plus";

const GlobeSvg = defineAsyncComponent(() =>
    import('../assets/copy-id.svg')
);

interface Props {
  name: string
}

export default defineComponent<Props>({
  name: 'GroupsListItem',
  components: { GlobeSvg, ElButton },
  setup: function() {
    const { result, loading } = useQuery(
      gql`
        query GetPosts {
          colocalizationAlgos {id, name}
        }
      `,
    )

    const notify = () => {
      ElNotification({  title: 'Title', message: 'Hey', type: 'success' });
    }

    return () => {
      console.log('result', result.value?.colocalizationAlgos[0].name)
      console.log('loading', loading.value)

      return (
        <div class='group-item bg'>
            <div className="text-3xl font-bold underline ">
                Hey dsdasds
xsdasd
            </div>
          <div class="h-20 h-20">
            <GlobeSvg height={30} width={30}/>
          </div>
            <ElButton type="primary" onClick={notify}>I am ElButton</ElButton>
        </div>
      )
    }
  },
})
