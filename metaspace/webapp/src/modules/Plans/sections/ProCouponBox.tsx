import { defineComponent } from 'vue'

/** Dashed campaign coupon: label, code and a Copy button on one row. */
export default defineComponent({
  name: 'ProCouponBox',
  props: {
    code: { type: String, required: true },
    percent: { type: Number, required: true },
    /** Campaign words before the percentage. */
    label: { type: String, default: 'BLACK FRIDAY CODE' },
    copied: { type: Boolean, default: false },
  },
  emits: ['copy'],
  setup(props, { emit }) {
    return () => (
      <div class="pro-coupon" data-test="coupon-box">
        <div class="pro-coupon__text">
          <span class="pro-coupon__label">
            {props.label} · {props.percent}% OFF
          </span>
          <span class="pro-coupon__code">{props.code}</span>
        </div>
        <button
          type="button"
          class="pro-coupon__copy"
          data-test="coupon-copy"
          aria-label={`${props.copied ? 'Copied' : 'Copy'} code ${props.code}`}
          onClick={() => emit('copy', props.code)}
        >
          {props.copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    )
  },
})
