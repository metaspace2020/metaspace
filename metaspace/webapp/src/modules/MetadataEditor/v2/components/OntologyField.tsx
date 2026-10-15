/* eslint-disable camelcase */
import { computed, defineComponent, nextTick, PropType, ref } from 'vue'
import { ElAutocomplete } from '../../../../lib/element-plus'
import { isTermEmpty, termText } from '../envelope'
import { MIN_QUERY_LENGTH } from '../termResolver'
import { FieldReport, OntologyTermValue, Term, TermResolver, ValueSuggestion } from '../types'
import './fields.scss'

interface TermSuggestion {
  value: string
  term: Term
  empty?: false
}
/** a plain-text value (curated or entered by other users); selecting it stores accepted free text */
interface ValueRow {
  value: string
  term?: undefined
  empty?: false
}
/**
 * row shown when a long-enough query matches nothing (or the field has no ontology slot); selecting it commits the
 * typed text as free text pending curation, the same as pressing Enter in the input
 */
interface EmptySuggestion {
  value: string
  empty: true
}
type Suggestion = TermSuggestion | ValueRow | EmptySuggestion

export const OntologyField = defineComponent({
  name: 'OntologyField',
  props: {
    value: { type: Object as PropType<OntologyTermValue | null>, default: null },
    slot: { type: String as PropType<string | undefined>, default: undefined },
    placeholder: { type: String, default: '' },
    inputId: { type: String, default: undefined },
    report: { type: Object as PropType<FieldReport | undefined>, default: undefined },
    acknowledged: { type: Boolean, default: false },
    fetchTerms: { type: Function as PropType<TermResolver>, required: true },
    /**
     * plain-text suggestions for fields without an ontology slot; when set it replaces the term lookup and a
     * selected value is stored as accepted free text
     */
    fetchValues: {
      type: Function as PropType<(query: string) => Promise<ValueSuggestion[]>>,
      default: undefined,
    },
    /** characters needed before suggestions are fetched (0 lists every value as soon as the input is focused) */
    minQueryLength: { type: Number, default: MIN_QUERY_LENGTH },
    /** show the suggestion list on focus, before anything is typed */
    openOnFocus: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
  },
  emits: ['input', 'acknowledge', 'applySuggestion'],
  setup(props, { emit, expose }) {
    const editing = ref(false)
    const draft = ref('')
    // true once the editor has committed (select or Enter), so the following blur does not commit again
    const committed = ref(false)
    const autocomplete = ref<any>(null)
    // the last value suggestions shown, so Enter on text that equals one stores it like a selection
    let lastValues: ValueSuggestion[] = []

    const hasValue = computed(() => !isTermEmpty(props.value))
    const showChip = computed(() => hasValue.value && !editing.value)
    const suggestion = computed(() => (props.acknowledged ? undefined : props.report?.suggestion))
    const needsReview = computed(
      () => (props.report?.state === 'review' || props.report?.state === 'copied') && !props.acknowledged
    )
    const chipClass = computed(() => {
      const state = props.value?.curation_state
      if (state === 'controlled') return 'v2-chip--controlled'
      if (state === 'free_text_accepted') return 'v2-chip--accepted'
      return 'v2-chip--pending'
    })

    const open = async (prefill?: string) => {
      draft.value = prefill ?? termText(props.value)
      editing.value = true
      committed.value = false
      await nextTick()
      autocomplete.value?.focus?.()
    }
    expose({ open })

    const clear = () => {
      emit('input', { curation_state: 'pending_curation' })
      open('')
    }

    const commitFreeText = () => {
      if (committed.value) return
      committed.value = true
      const text = draft.value.trim()
      const known = lastValues.find((v) => v.label.toLowerCase() === text.toLowerCase())
      if (text && text !== termText(props.value)) {
        emit(
          'input',
          known
            ? { value_free_text: known.label, curation_state: 'free_text_accepted' }
            : { value_free_text: text, curation_state: 'pending_curation' }
        )
      } else if (!text && hasValue.value) {
        emit('input', { curation_state: 'pending_curation' })
      }
      editing.value = false
    }

    const fetchSuggestions = async (query: string, cb: (items: Suggestion[]) => void) => {
      const q = (query || '').trim()
      if (q.length < props.minQueryLength) {
        cb([])
        return
      }
      const empty: EmptySuggestion[] = q ? [{ value: q, empty: true }] : []
      if (props.fetchValues) {
        try {
          lastValues = await props.fetchValues(q)
        } catch (err) {
          lastValues = []
        }
        cb(lastValues.length > 0 ? lastValues.map((v) => ({ value: v.label })) : empty)
        return
      }
      if (!props.slot) {
        cb(empty)
        return
      }
      try {
        const terms = await props.fetchTerms(props.slot, q)
        cb(terms.length > 0 ? terms.map((term) => ({ value: `${term.label} (${term.curie})`, term })) : empty)
      } catch (err) {
        cb(empty)
      }
    }

    const onSelect = (item: Suggestion) => {
      // the "no matching terms" row adds the typed text as pending curation (ElAutocomplete has already emitted
      // `input` with the row's value, so the draft holds the query)
      if (item.empty) {
        commitFreeText()
        return
      }
      committed.value = true
      if (item.term) {
        emit('input', {
          value_ontology_id: item.term.curie,
          value_label: item.term.label,
          curation_state: 'controlled',
        })
      } else {
        emit('input', { value_free_text: item.value, curation_state: 'free_text_accepted' })
      }
      editing.value = false
    }

    const onChipKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        open()
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        clear()
      }
    }

    return () => {
      if (showChip.value) {
        const v = props.value!
        const label = termText(v)
        return (
          <div class="flex flex-wrap items-center gap-1">
            <span
              class={['v2-chip', chipClass.value]}
              role="button"
              tabindex={props.disabled ? -1 : 0}
              aria-label={`${label}, press Enter to change, Backspace to clear`}
              onClick={() => !props.disabled && open()}
              onKeydown={onChipKeydown}
            >
              <i class="v2-chip__dot" aria-hidden="true" />
              <span class="v2-chip__label">{label}</span>
              {v.value_ontology_id && <span class="v2-chip__id">{v.value_ontology_id}</span>}
              {suggestion.value && (
                <span class="v2-chip__id">
                  → {suggestion.value.label} ({suggestion.value.curie}) ?
                </span>
              )}
              {!v.value_ontology_id && !suggestion.value && v.curation_state === 'pending_curation' && (
                <span class="v2-chip__id">pending curation</span>
              )}
              {!v.value_ontology_id && !suggestion.value && v.curation_state === 'free_text_accepted' && (
                <span class="v2-chip__id">accepted</span>
              )}{' '}
              <span class="v2-chip__mark" aria-hidden="true">
                {chipClass.value === 'v2-chip--pending' ? '✎' : '✓'}
              </span>
              {!props.disabled && (
                // inside the pill so it never wraps to its own line; its events must not reach the chip
                <button
                  type="button"
                  class="v2-chip__clear"
                  aria-label="Clear value"
                  onClick={(e: MouseEvent) => {
                    e.stopPropagation()
                    clear()
                  }}
                  onKeydown={(e: KeyboardEvent) => e.stopPropagation()}
                >
                  ×
                </button>
              )}
            </span>
            {suggestion.value && (
              <button type="button" class="v2-chip__use" onClick={() => emit('applySuggestion')}>
                Use suggestion
              </button>
            )}
            {needsReview.value && (
              <button type="button" class="v2-chip__keep" onClick={() => emit('acknowledge')}>
                Keep as typed
              </button>
            )}
          </div>
        )
      }
      // keydown is caught on the wrapper because ElAutocomplete does not forward it from its inner input
      return (
        <div class="w-full" onKeydown={(e: KeyboardEvent) => e.key === 'Enter' && commitFreeText()}>
          <ElAutocomplete
            ref={autocomplete}
            id={props.inputId}
            class="w-full"
            modelValue={draft.value}
            placeholder={props.placeholder}
            disabled={props.disabled}
            debounce={300}
            triggerOnFocus={props.openOnFocus}
            fetchSuggestions={fetchSuggestions}
            onInput={(text: string) => {
              draft.value = text
              committed.value = false
            }}
            onSelect={onSelect}
            onBlur={commitFreeText}
            popperClass="v2-ac-popper"
            v-slots={{
              // the test-utils stub renders this slot without props, so `item` may be missing
              default: (scope?: { item?: Suggestion }) =>
                scope?.item?.empty ? (
                  <span class="v2-ac-empty">
                    No match — <span class="v2-ac-empty__action">Add “{scope.item.value}”</span> (pending curation)
                  </span>
                ) : (
                  <span>{scope?.item?.value}</span>
                ),
            }}
          />
        </div>
      )
    }
  },
})
