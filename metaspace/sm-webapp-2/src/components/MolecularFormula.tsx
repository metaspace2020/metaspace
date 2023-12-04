import { defineComponent, computed } from 'vue';
import { reorderAdducts, superscript } from '../lib/util';

export default defineComponent({
  name: 'MolecularFormula',
  props: {
    ion: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    const formulaAndCharge = computed(() => {
      const match = /^(.*?)([+-]\d*)?$/.exec(props.ion);
      const formula = match && match[1] || props.ion;
      const charge = match && match[2] || undefined;
      return { formula, charge };
    });

    const fmtCharge = computed(() => {
      const { charge } = formulaAndCharge.value;
      return charge !== undefined ? superscript(charge) : '';
    });

    const parts = computed<string[]>(() => {
      const { formula } = formulaAndCharge.value;
      const fmtFormula = reorderAdducts(formula).replace(/([+-])/g, ' $1 ');
      return fmtFormula.split(/(\d+)/g);
    });

    return () => (
      <span>
        [{parts.value.map((part, index) => {
          return index % 2 === 0 ? part : <sub class="leading-none">{part}</sub>;
        })}]
        {fmtCharge.value}
      </span>
    );
  },
});
