import { mount } from '@vue/test-utils'
import ExperimentVariablesCard from './ExperimentVariablesCard'
import { ElSelect } from '../../../lib/element-plus'
import { emptyVariables } from '../composables/experimentVariables'

describe('ExperimentVariablesCard', () => {
  it('renders one tag input per variable with current values', () => {
    const wrapper = mount(ExperimentVariablesCard, {
      props: { modelValue: { ...emptyVariables(), condition: ['Cond1', 'Cond2'] } },
    })
    expect(wrapper.find('[data-test-key="experiment-variables-card"]').exists()).toBe(true)
    expect(wrapper.findAllComponents(ElSelect)).toHaveLength(4)
    expect(wrapper.find('[data-test-key="variable-input-condition"]').exists()).toBe(true)
  })

  it('emits change-variable with the key and new values when a tag input changes', async () => {
    const wrapper = mount(ExperimentVariablesCard, {
      props: { modelValue: emptyVariables() },
    })
    // condition is the first select (VARIABLE_KEYS order)
    const conditionSelect = wrapper.findAllComponents(ElSelect)[0]
    await (conditionSelect.vm as any).$emit('change', ['Cond1'])
    expect(wrapper.emitted('change-variable')).toBeTruthy()
    expect(wrapper.emitted('change-variable')![0][0]).toEqual({ key: 'condition', values: ['Cond1'] })
  })
})
