import { defineComponent, PropType } from 'vue'
import { FieldKey } from '../types'
import './fields.scss'

export const CarryOverHint = defineComponent({
  name: 'CarryOverHint',
  props: {
    legacyLabel: { type: String, required: true },
    raw: { type: String, required: true },
    targets: { type: Array as PropType<{ key: FieldKey; label: string }[]>, required: true },
  },
  emits: ['use'],
  setup(props, { emit }) {
    return () => (
      <div class="v2-carry">
        ↳ legacy "{props.legacyLabel}: {props.raw}" —{' '}
        {props.targets.map((t, i) => (
          <span key={t.key}>
            {i > 0 && ' · '}
            <button type="button" onClick={() => emit('use', t.key)}>
              {i === 0 ? 'use here' : `use as ${t.label}`}
            </button>
          </span>
        ))}
      </div>
    )
  },
})
