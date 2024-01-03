import { defineComponent, ref, watch } from 'vue';
import { ElInput } from 'element-plus';
import * as Form from '../../components/Form';

export const DOI_ORG_DOMAIN = 'https://doi.org/';

interface Props {
  value: string;
}

export default defineComponent({
  name: 'DoiField',
  props: {
    modelValue: {
      type: String,
      default: '',
    },
    id: {
      type: String,
      default: '',
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  setup(props: Props | any, { emit }) {
    const inputValue = ref(props.modelValue.replace(DOI_ORG_DOMAIN, ''));

    watch(() => props.modelValue, (newValue) => {
      inputValue.value = newValue.replace(DOI_ORG_DOMAIN, '');
    });
    const onInput = (value: string) => {
      emit('update:modelValue', value.length ? `${DOI_ORG_DOMAIN}${value}` : '');
    };

    const appendContent = () => (
      <a
        href={props.modelValue || null}
        target="_blank"
        rel="noopener"
        class="text-inherit"
      >
        Test link
      </a>
    );

    return () => (
      <div>
        <label for={props.id}>
          <Form.PrimaryLabelText>Publication DOI</Form.PrimaryLabelText>
          <Form.SecondaryLabelText>Should link to the published paper</Form.SecondaryLabelText>
        </label>
        <ElInput
          id={props.id}
          modelValue={inputValue.value}
          {...{'onUpdate:modelValue': onInput}}
          v-slots={{
            prepend: () => <span>{DOI_ORG_DOMAIN}</span>,
            append: appendContent }}
        />
      </div>
    );
  },
});
