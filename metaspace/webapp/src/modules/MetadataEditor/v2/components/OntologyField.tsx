/* eslint-disable camelcase */
import { computed, defineComponent, nextTick, PropType, ref } from 'vue'
import { ElAutocomplete } from '../../../../lib/element-plus'
import { isTermEmpty, termText } from '../envelope'
import { normaliseText } from '../legacyLookups'
import { MIN_QUERY_LENGTH } from '../termResolver'
import { CurationStatus, OntologyTermValue, Term, TermResolver, ValueSuggestion } from '../types'
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
const isEmptyRow = (item: Suggestion): item is EmptySuggestion => item.empty === true

/** compare key for "the typed text is this known value": trimmed, case-insensitive */
const normalize = (text: string): string => text.trim().toLowerCase()

export const OntologyField = defineComponent({
  name: 'OntologyField',
  props: {
    value: { type: Object as PropType<OntologyTermValue | null>, default: null },
    slot: { type: String as PropType<string | undefined>, default: undefined },
    placeholder: { type: String, default: '' },
    inputId: { type: String, default: undefined },
    fetchTerms: { type: Function as PropType<TermResolver>, required: true },
    /**
     * plain-text suggestions; they follow the ontology terms of a bound field and are the only rows of a field
     * without a slot. A selected value is stored as accepted free text
     */
    fetchValues: {
      type: Function as PropType<(query: string) => Promise<ValueSuggestion[]>>,
      default: undefined,
    },
    /**
     * characters needed before suggestions are fetched; the short local curated / community lists use 1. Never
     * below 1: an empty query fetches nothing
     */
    minQueryLength: { type: Number, default: MIN_QUERY_LENGTH },
    /**
     * the field's curated values; Enter on text equal to one of them (any case) stores it as accepted free text,
     * the same as selecting it from the list, even before a lookup has run
     */
    knownValues: { type: Array as PropType<string[]>, default: () => [] },
    disabled: { type: Boolean, default: false },
    /**
     * the curator's decision on the free text this dataset stores for the field (datasetCurationStatus). Display
     * only: a rejection of the text the field still holds turns the pending chip red and shows the note
     */
    curationStatus: { type: Object as PropType<CurationStatus | undefined>, default: undefined },
  },
  emits: ['input'],
  setup(props, { emit, expose }) {
    const editing = ref(false)
    const draft = ref('')
    // true once the editor has committed (select or Enter), so the following blur does not commit again
    const committed = ref(false)
    const autocomplete = ref<any>(null)
    // the rows of the last lookup for the current editing session, so Enter on text that equals one of them stores
    // it like a selection; open() empties it and bumps the generation so a lookup still in flight is dropped
    let lastSuggestions: (TermSuggestion | ValueRow)[] = []
    let generation = 0

    const hasValue = computed(() => !isTermEmpty(props.value))
    const showChip = computed(() => hasValue.value && !editing.value)
    /** the stored value is pending free text that a curator rejected (same text, normalised as the server does) */
    const rejected = computed(() => {
      const v = props.value
      const row = props.curationStatus
      return (
        !!v &&
        !!row &&
        row.status === 'REJECTED' &&
        v.curation_state === 'pending_curation' &&
        !v.value_ontology_id &&
        !!v.value_free_text &&
        normaliseText(v.value_free_text) === normaliseText(row.text)
      )
    })
    const chipClass = computed(() => {
      if (rejected.value) return 'v2-chip--rejected'
      const state = props.value?.curation_state
      if (state === 'controlled') return 'v2-chip--controlled'
      if (state === 'free_text_accepted') return 'v2-chip--accepted'
      return 'v2-chip--pending'
    })

    const open = async (prefill?: string) => {
      lastSuggestions = []
      generation += 1
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

    /** the value a selection of this row stores (shared by onSelect and Enter on matching text) */
    const valueOf = (row: TermSuggestion | ValueRow): OntologyTermValue =>
      row.term
        ? { value_ontology_id: row.term.curie, value_label: row.term.label, curation_state: 'controlled' }
        : { value_label: row.value, value_free_text: row.value, curation_state: 'free_text_accepted' }

    /**
     * the known value the typed text names: a row of the last lookup (a term by its label or by its row text) or
     * one of the field's curated values, compared trimmed and case-insensitively
     */
    const knownValueFor = (text: string): OntologyTermValue | undefined => {
      const key = normalize(text)
      const row = lastSuggestions.find(
        (r) => normalize(r.value) === key || (r.term !== undefined && normalize(r.term.label) === key)
      )
      if (row) return valueOf(row)
      const curated = props.knownValues.find((v) => normalize(v) === key)
      return curated ? valueOf({ value: curated.trim() }) : undefined
    }

    const isSameValue = (a: OntologyTermValue, b: OntologyTermValue | null): boolean =>
      !!b &&
      a.curation_state === b.curation_state &&
      (a.value_ontology_id || null) === (b.value_ontology_id || null) &&
      termText(a) === termText(b)

    /**
     * commits the typed text (Enter, the "No match" row, blur). A blur that leaves the text unchanged (ignoring case
     * and padding) keeps a controlled or accepted value exactly as it is: opening a chip and leaving it never
     * re-spells or downgrades it. A pending value still goes through, so a curated match promotes it.
     */
    const commitFreeText = (fromBlur = false) => {
      if (committed.value) return
      committed.value = true
      const text = draft.value.trim()
      const unchanged =
        fromBlur &&
        hasValue.value &&
        props.value?.curation_state !== 'pending_curation' &&
        normalize(text) === normalize(termText(props.value))
      if (!unchanged) {
        const known = text ? knownValueFor(text) : undefined
        if (known) {
          if (!isSameValue(known, props.value)) emit('input', known)
        } else if (text && text !== termText(props.value)) {
          emit('input', { value_free_text: text, curation_state: 'pending_curation' })
        } else if (!text && hasValue.value) {
          emit('input', { curation_state: 'pending_curation' })
        }
      }
      editing.value = false
    }

    const lookup = async (q: string): Promise<(TermSuggestion | ValueRow)[]> => {
      // terms then values, each fetched on its own: one failing source still lists the other's rows, and when
      // both fail only the "No match" row is offered
      const rows: (TermSuggestion | ValueRow)[] = []
      if (props.slot) {
        try {
          const terms = await props.fetchTerms(props.slot, q)
          rows.push(...terms.map((term) => ({ value: `${term.label} (${term.curie})`, term })))
        } catch (err) {
          // no term rows
        }
      }
      if (props.fetchValues) {
        try {
          const values: ValueSuggestion[] = await props.fetchValues(q)
          rows.push(...values.map((v) => ({ value: v.label })))
        } catch (err) {
          // no value rows
        }
      }
      return rows
    }

    const fetchSuggestions = async (query: string, cb: (items: Suggestion[]) => void) => {
      const q = (query || '').trim()
      if (q.length < Math.max(1, props.minQueryLength)) {
        cb([])
        return
      }
      const started = generation
      const rows = await lookup(q)
      // a lookup that started before open() belongs to the previous editing session
      if (started === generation) lastSuggestions = rows
      cb(rows.length > 0 ? rows : [{ value: q, empty: true }])
    }

    const onSelect = (item: Suggestion) => {
      // the "no matching terms" row adds the typed text as pending curation (ElAutocomplete has already emitted
      // `input` with the row's value, so the draft holds the query)
      if (isEmptyRow(item)) {
        commitFreeText()
        return
      }
      committed.value = true
      emit('input', valueOf(item))
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
            {/* the pill is not interactive itself: its body (re-opens the editor) and the × are sibling buttons */}
            <span class={['v2-chip', chipClass.value]}>
              <button
                type="button"
                class="v2-chip__body"
                disabled={props.disabled}
                aria-label={`${label}, press Enter to change, Backspace to clear`}
                onClick={() => open()}
                onKeydown={onChipKeydown}
              >
                <i class="v2-chip__dot" aria-hidden="true" />
                <span class="v2-chip__label">{label}</span>
                {v.value_ontology_id && <span class="v2-chip__id">{v.value_ontology_id}</span>}
                {rejected.value && <span class="v2-chip__id">· rejected</span>}
                {!rejected.value && !v.value_ontology_id && v.curation_state === 'pending_curation' && (
                  <span class="v2-chip__id">pending curation</span>
                )}
                {!v.value_ontology_id && v.curation_state === 'free_text_accepted' && (
                  <span class="v2-chip__id">accepted</span>
                )}{' '}
                <span class="v2-chip__mark" aria-hidden="true">
                  {rejected.value ? '✕' : chipClass.value === 'v2-chip--pending' ? '✎' : '✓'}
                </span>
              </button>
              {!props.disabled && (
                // inside the pill (so it never wraps to its own line) but not inside the body button
                <button type="button" class="v2-chip__clear" aria-label="Clear value" onClick={clear}>
                  ×
                </button>
              )}
            </span>
            {rejected.value && (
              <div class="v2-hint v2-hint--rejected w-full">
                {props.curationStatus?.note
                  ? `Rejected by a curator: ${props.curationStatus.note}`
                  : 'Rejected by a curator.'}
              </div>
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
            triggerOnFocus={false}
            fetchSuggestions={fetchSuggestions}
            onInput={(text: string) => {
              draft.value = text
              committed.value = false
            }}
            onSelect={onSelect}
            onBlur={() => commitFreeText(true)}
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
