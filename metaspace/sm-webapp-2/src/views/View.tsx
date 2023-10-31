import { defineComponent } from 'vue'
import { defineAsyncComponent } from 'vue';
import { ElButton } from 'element-plus'
import './View.scss'
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
    const notify = () => {
      ElNotification({  title: 'Title', message: 'Hey', type: 'success' });
    }

    return () => {
      return (
        <div class='group-item'>
          <div class="h-20 h-20">
            <GlobeSvg height={30} width={30}/>
          </div>
            <ElButton type="primary" onClick={notify}>I am ElButton</ElButton>
        </div>
      )
    }
  },
})
