import { defineComponent, reactive, ref } from 'vue';
import { ElInput, ElTooltip, ElButton } from 'element-plus';
import copyToClipboard from '../../lib/copyToClipboard';

interface Props {
  value: string;
  type: string;
}

export default defineComponent({
  name: 'YourComponentName',
  props: {
    value: String,
    type: {
      type: String,
      default: 'text',
    },
  },
  setup(props: Props | any) {
    const state = reactive({
      copied: false,
      focussed: false,
    });

    const inputRef = ref<InstanceType<typeof ElInput>>();

    const handleCopy = () => {
      copyToClipboard(props.value);
      state.copied = true;
    };

    const handleFocus = () => {
      inputRef.value?.select();
      state.focussed = true;
    };

    const handleBlur = () => {
      state.focussed = false;
    };

    return () => (
      <ElInput
        ref={inputRef}
        modelValue={props.value}
        type={state.focussed ? 'text' : props.type}
        onFocus={handleFocus}
        onBlur={handleBlur}
        readonly
      >
        {{
          append: () => (
            <ElTooltip
              visible={state.copied}
              content="Copied!"
              placement="right"
            >
              <ElButton
                icon="el-icon-document-copy"
                onClick={handleCopy}
                onMouseleave={() => { state.copied = false; }}
                {...{
                  onMouseleave: () => { state.copied = false; },
                  title: 'Copy to clipboard'
                }}
              />
            </ElTooltip>
          ),
        }}
      </ElInput>
    );
  },
});
