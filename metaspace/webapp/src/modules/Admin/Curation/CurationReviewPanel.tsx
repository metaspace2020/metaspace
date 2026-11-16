import { computed, defineComponent, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { DefaultApolloClient, useMutation, useQuery } from '@vue/apollo-composable'
import { ElAutocomplete, ElButton, ElInput, ElRadio, ElRadioGroup, ElTag } from '../../../lib/element-plus'
import {
  approveCurationTermsMutation,
  CurationDecisionResult,
  CurationTerm,
  curationTermQuery,
  curationTermsQuery,
  CurationTermPage,
  mapCurationTermsMutation,
  rejectCurationTermsMutation,
  retryCurationApplyMutation,
} from '../../../api/metadataCuration'
import { fetchOntologyTermSuggestionsQuery } from '../../../api/metadata'
import { CURATED_VALUES } from '../../MetadataEditor/v2/curatedValues'
import { FieldKey } from '../../MetadataEditor/v2/types'
import { slotOption } from './slotLabels'
import { DatasetLink, formatCurationDate } from './CurationTable'
import './CurationReviewPanel.scss'

const POLL_MS = 2000
/** an apply still RUNNING this long after the decision is assumed to have died */
const STALE_APPLY_MS = 10 * 60 * 1000
const TARGET_LIMIT = 8

type Decision = 'approve' | 'map' | 'reject'

/**
 * A bound slot maps to an ontology CURIE; an unbound slot to a seed value of its curated list (no id: the row is
 * approved under that label) or to an APPROVED row of the same slot (`targetTermId`).
 */
interface MapTarget {
  value: string
  ontologyId?: string
  targetTermId?: string
  /** the single placeholder row shown when nothing matches; never selectable */
  notFound?: boolean
}

const NOT_FOUND = (query: string): MapTarget[] => [{ value: query, notFound: true }]

interface OntologySuggestion {
  curie: string
  label: string
}

/** keyboard shortcuts must not fire while the user types */
export const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return true
  const editable = target.closest('[contenteditable]')
  return editable != null && editable.getAttribute('contenteditable') !== 'false'
}

/** the seed values of a curated-list slot */
const seedValues = (slot: string): string[] => CURATED_VALUES[slot as FieldKey] || []

/** the seed value spelled like `label`, ignoring case */
const findSeed = (slot: string, label: string): string | undefined =>
  seedValues(slot).find((seed) => seed.toLowerCase() === label.trim().toLowerCase())

const errorMessage = (err: any): string =>
  err?.graphQLErrors?.[0]?.message || err?.message || 'The decision could not be saved.'

export const CurationReviewPanel = defineComponent({
  name: 'CurationReviewPanel',
  props: {
    termId: { type: String, default: null },
  },
  emits: {
    close: () => true,
    next: () => true,
    prev: () => true,
    decided: (term: CurationTerm) => term != null,
  },
  setup(props, { emit }) {
    const apolloClient: any = inject(DefaultApolloClient)

    const { result: termResult, refetch: refetchTerm } = useQuery<{ curationTerm: CurationTerm | null }>(
      curationTermQuery,
      () => ({ id: props.termId || '' }),
      () => ({ enabled: !!props.termId, fetchPolicy: 'network-only' })
    )
    // apollo keeps the previous term while the next one loads; never show it under the new id
    const term = computed<CurationTerm | null>(() => {
      const t = termResult.value?.curationTerm
      return t && t.id === props.termId ? t : null
    })
    const slot = computed(() => (term.value ? slotOption(term.value.slot) : null))

    const { mutate: approve } = useMutation<{ approveCurationTerms: CurationDecisionResult }>(
      approveCurationTermsMutation
    )
    const { mutate: map } = useMutation<{ mapCurationTerms: CurationDecisionResult }>(mapCurationTermsMutation)
    const { mutate: reject } = useMutation<{ rejectCurationTerms: CurationDecisionResult }>(rejectCurationTermsMutation)
    const { mutate: retry } = useMutation<{ retryCurationApply: CurationTerm }>(retryCurationApplyMutation)

    const decision = ref<Decision>('approve')
    const canonicalLabel = ref('')
    const aliases = ref<string[]>([])
    const aliasInput = ref('')
    const mapQuery = ref('')
    const target = ref<MapTarget | null>(null)
    const note = ref('')
    const submitting = ref(false)
    const error = ref<string | null>(null)

    /**
     * An unbound row's suggestion is a seed value of the slot or the label of an APPROVED row of the same slot (no
     * CURIE): a seed is the target as is; otherwise look the row up so the map can send its id. Without a match the
     * suggestion is not mappable and the decision falls back to approve.
     */
    const resolveUnboundSuggestion = async (t: CurationTerm, label: string) => {
      const seed = findSeed(t.slot, label)
      if (seed) {
        target.value = { value: seed }
        mapQuery.value = seed
        return
      }
      let match: CurationTerm | undefined
      try {
        const { data } = await apolloClient.query({
          query: curationTermsQuery,
          variables: { status: 'APPROVED', slot: t.slot, query: label, limit: TARGET_LIMIT },
          fetchPolicy: 'network-only',
        })
        match = (data?.curationTerms as CurationTermPage | undefined)?.terms.find(
          (row) => row.id !== t.id && (row.canonicalLabel || row.text).toLowerCase() === label.toLowerCase()
        )
      } catch (err) {
        match = undefined
      }
      // the panel may have moved on, or the admin already picked something else
      if (term.value?.id !== t.id || target.value != null || mapQuery.value !== label) return
      if (match) {
        target.value = { value: match.canonicalLabel || match.text, targetTermId: match.id }
      } else if (decision.value === 'map') {
        decision.value = 'approve'
      }
    }

    const resetForm = (t: CurationTerm) => {
      const bound = slotOption(t.slot).bound
      const suggested =
        t.suggestedLabel && t.suggestedOntologyId && bound
          ? { value: t.suggestedLabel, ontologyId: t.suggestedOntologyId }
          : null
      decision.value = t.suggestedLabel ? 'map' : 'approve'
      canonicalLabel.value = t.canonicalLabel || t.text
      aliases.value = [...t.aliases]
      aliasInput.value = ''
      target.value = suggested
      mapQuery.value = t.suggestedLabel && (suggested || !bound) ? t.suggestedLabel : ''
      note.value = ''
      error.value = null
      if (t.suggestedLabel && !bound) resolveUnboundSuggestion(t, t.suggestedLabel)
    }
    watch(
      () => term.value?.id,
      () => term.value && resetForm(term.value),
      { immediate: true }
    )

    // poll the term while its apply runs; `now` makes the staleness check tick with it
    const now = ref(Date.now())
    const running = computed(() => term.value?.applyState === 'RUNNING')
    let pollTimer: ReturnType<typeof setInterval> | null = null
    const stopPolling = () => {
      if (pollTimer != null) {
        clearInterval(pollTimer)
        pollTimer = null
      }
    }
    watch(
      running,
      (isRunning) => {
        stopPolling()
        if (isRunning) {
          pollTimer = setInterval(() => {
            now.value = Date.now()
            Promise.resolve(refetchTerm()).catch(() => undefined)
          }, POLL_MS)
        }
      },
      { immediate: true }
    )
    onBeforeUnmount(stopPolling)

    const canRetry = computed(() => {
      const t = term.value
      if (!t) return false
      if (t.applyState === 'FAILED') return true
      return running.value && t.decidedAt != null && now.value - Date.parse(t.decidedAt) > STALE_APPLY_MS
    })

    const onKeydown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return
      if (e.key === 'Escape') emit('close')
      else if (e.key === 'j' || e.key === 'J') emit('next')
      else if (e.key === 'k' || e.key === 'K') emit('prev')
    }
    onMounted(() => window.addEventListener('keydown', onKeydown))
    onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

    const addAlias = () => {
      const alias = aliasInput.value.trim()
      if (alias && !aliases.value.some((a) => a.toLowerCase() === alias.toLowerCase())) {
        aliases.value = [...aliases.value, alias]
      }
      aliasInput.value = ''
    }

    const fetchTargets = async (query: string, cb: (items: MapTarget[]) => void) => {
      const t = term.value
      if (!t || !query.trim()) {
        cb([])
        return
      }
      try {
        if (slotOption(t.slot).bound) {
          const { data } = await apolloClient.query({
            query: fetchOntologyTermSuggestionsQuery,
            variables: { slot: t.slot, query },
            fetchPolicy: 'cache-first',
          })
          const terms = (data.ontologyTermSuggestions as OntologySuggestion[]).map((s) => ({
            value: s.label,
            ontologyId: s.curie,
          }))
          cb(terms.length > 0 ? terms : NOT_FOUND(query))
        } else {
          const q = query.trim().toLowerCase()
          const seeds: MapTarget[] = seedValues(t.slot)
            .filter((seed) => seed.toLowerCase().includes(q))
            .map((seed) => ({ value: seed }))
          let approved: MapTarget[] = []
          try {
            const { data } = await apolloClient.query({
              query: curationTermsQuery,
              variables: { status: 'APPROVED', slot: t.slot, query, limit: TARGET_LIMIT },
              fetchPolicy: 'network-only',
            })
            approved = (data.curationTerms as CurationTermPage).terms
              .filter((row) => row.id !== t.id)
              .map((row) => ({ value: row.canonicalLabel || row.text, targetTermId: row.id }))
          } catch (err) {
            approved = []
          }
          // seeds first; an approved row spelled like any seed of the slot (ignoring case) is offered as that seed,
          // even when only its text or an alias matched the query: the seed spelling wins and maps by label
          const seen = new Set<string>()
          const options = [
            ...seeds,
            ...approved.map((row) => {
              const seed = findSeed(t.slot, row.value)
              return seed ? { value: seed } : row
            }),
          ].filter((option) => {
            const key = option.value.toLowerCase()
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })
          cb(options.length > 0 ? options : NOT_FOUND(query))
        }
      } catch (err) {
        cb([])
      }
    }

    const canSubmit = computed(() => {
      if (!term.value || running.value || submitting.value) return false
      if (decision.value === 'approve') return canonicalLabel.value.trim() !== ''
      if (decision.value === 'map') return target.value != null
      return note.value.trim() !== ''
    })

    const primaryLabel = computed(() => {
      if (decision.value === 'approve') return '✓ Approve & apply'
      if (decision.value === 'map') return 'Map & apply'
      return 'Reject'
    })

    const submit = async () => {
      const t = term.value
      if (!t || !canSubmit.value) return
      const ids = [t.id]
      const trimmedNote = note.value.trim()
      submitting.value = true
      error.value = null
      try {
        let decided: CurationDecisionResult | undefined
        if (decision.value === 'approve') {
          const res = await approve({
            input: {
              ids,
              canonicalLabel: canonicalLabel.value.trim(),
              aliases: aliases.value,
              note: trimmedNote || null,
            },
          })
          decided = res?.data?.approveCurationTerms
        } else if (decision.value === 'map' && !target.value?.ontologyId && !target.value?.targetTermId) {
          // a seed value has no row to map to: the row is approved under the seed's label
          const res = await approve({
            input: { ids, canonicalLabel: (target.value as MapTarget).value, note: trimmedNote || null },
          })
          decided = res?.data?.approveCurationTerms
        } else if (decision.value === 'map') {
          const picked = target.value as MapTarget
          const res = await map({
            input: {
              ids,
              ...(picked.ontologyId ? { ontologyId: picked.ontologyId } : { targetTermId: picked.targetTermId }),
              note: trimmedNote || null,
            },
          })
          decided = res?.data?.mapCurationTerms
        } else {
          const res = await reject({ input: { ids, note: trimmedNote } })
          decided = res?.data?.rejectCurationTerms
        }
        emit('decided', decided?.terms?.[0] ?? t)
      } catch (err) {
        error.value = errorMessage(err)
      } finally {
        submitting.value = false
      }
    }

    const onRetry = async () => {
      const t = term.value
      if (!t) return
      error.value = null
      try {
        await retry({ id: t.id })
        await refetchTerm()
      } catch (err) {
        error.value = errorMessage(err)
      }
    }

    const renderHeader = (t: CurationTerm) => (
      <div class="curation-panel-section curation-panel-header">
        <div class="flex items-start justify-between">
          <div class="curation-panel-eyebrow">Review term</div>
          <button class="curation-close" aria-label="Close" onClick={() => emit('close')}>
            ×
          </button>
        </div>
        <div class="flex items-center gap-2">
          <h2 class="curation-panel-title">{t.text}</h2>
          <span class="curation-pill">{t.status.toLowerCase()}</span>
        </div>
        <div class="curation-panel-sub">{`${slot.value?.label} · ${slot.value?.vocabulary}`}</div>
      </div>
    )

    /** the row's dataset (link), its submitter and when it was submitted */
    const renderUsage = (t: CurationTerm) => {
      const rest = [t.submitter?.name, formatCurationDate(t.submittedAt)].filter(Boolean)
      return (
        <div class="curation-panel-section">
          <div class="curation-usage">
            <DatasetLink term={t} />
            <span>{rest.map((part) => ` · ${part}`).join('')}</span>
          </div>
        </div>
      )
    }

    const renderApprove = () => (
      <div class="curation-option-body">
        <label class="curation-label">Canonical label</label>
        <ElInput
          class="curation-canonical"
          modelValue={canonicalLabel.value}
          onUpdate:modelValue={(v: string) => (canonicalLabel.value = v)}
        />
        <label class="curation-label">Synonyms</label>
        <div class="curation-aliases">
          {aliases.value.map((alias) => (
            <ElTag
              key={alias}
              class="curation-alias"
              closable
              disableTransitions
              onClose={() => (aliases.value = aliases.value.filter((a) => a !== alias))}
            >
              {alias}
            </ElTag>
          ))}
          <ElInput
            class="curation-alias-input"
            size="small"
            placeholder="add…"
            modelValue={aliasInput.value}
            onUpdate:modelValue={(v: string) => (aliasInput.value = v)}
            onKeydown={(e: KeyboardEvent) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addAlias()
              }
            }}
          />
        </div>
        <p class="curation-helper">
          {`Adds "${canonicalLabel.value.trim()}" to the ${slot.value?.label} values for everyone.`}
        </p>
      </div>
    )

    const renderMap = () => (
      <div class="curation-option-body">
        <ElAutocomplete
          class="curation-map w-full"
          modelValue={mapQuery.value}
          placeholder={`Search ${slot.value?.label}…`}
          valueKey="value"
          fetchSuggestions={fetchTargets}
          onUpdate:modelValue={(v: string) => {
            mapQuery.value = v
            if (target.value && target.value.value !== v) target.value = null
          }}
          onSelect={(item: MapTarget) => {
            if (item.notFound) return
            target.value = item
            mapQuery.value = item.value
          }}
        >
          {{
            // the input renders this slot too, without an item
            default: ({ item }: { item?: MapTarget }) =>
              item &&
              (item.notFound ? (
                <span class="curation-muted">Not found</span>
              ) : (
                <span>
                  {item.value}
                  {item.ontologyId && <span class="curation-muted">{` ${item.ontologyId}`}</span>}
                </span>
              )),
          }}
        </ElAutocomplete>
        {target.value && (
          <div class="curation-target">
            <span class="curation-chip">
              {target.value.ontologyId ? `${target.value.value} ${target.value.ontologyId}` : target.value.value}
            </span>
          </div>
        )}
      </div>
    )

    const renderReject = () => (
      <div class="curation-option-body">
        <p class="curation-helper">
          This dataset's next save of the same text will be refused with the reason below; other datasets are not
          affected. The dataset keeps its current value.
        </p>
      </div>
    )

    const OPTIONS: { value: Decision; label: string; body: () => ReturnType<typeof renderApprove> }[] = [
      { value: 'approve', label: 'Approve as new term', body: renderApprove },
      { value: 'map', label: 'Map to existing term', body: renderMap },
      { value: 'reject', label: 'Reject', body: renderReject },
    ]

    const renderDecision = () => (
      <div class="curation-panel-section">
        <div class="curation-panel-eyebrow">Decision</div>
        <ElRadioGroup
          class="curation-decision"
          modelValue={decision.value}
          onUpdate:modelValue={(v: string | number | boolean) => (decision.value = v as Decision)}
        >
          {OPTIONS.map((o) => (
            <div key={o.value} class={['curation-option', { 'curation-option--active': decision.value === o.value }]}>
              <ElRadio label={o.value}>{o.label}</ElRadio>
              {decision.value === o.value && o.body()}
            </div>
          ))}
        </ElRadioGroup>
      </div>
    )

    const renderFooter = (t: CurationTerm) => (
      <div class="curation-panel-section curation-panel-footer">
        <label class="curation-label">
          {decision.value === 'reject'
            ? 'Reason (required; shown when the text is submitted again)'
            : 'Note to submitters (optional)'}
        </label>
        <ElInput
          class="curation-note"
          type="textarea"
          rows={2}
          modelValue={note.value}
          onUpdate:modelValue={(v: string) => (note.value = v)}
        />
        {(running.value || t.applyState === 'FAILED') && (
          <div class="curation-apply-state">
            {running.value ? <span>Applying…</span> : <span class="curation-error">apply failed</span>}
            {canRetry.value && (
              <ElButton size="small" onClick={onRetry}>
                Retry
              </ElButton>
            )}
          </div>
        )}
        {error.value && <p class="curation-error">{error.value}</p>}
        <div class="flex items-center gap-2 mt-2">
          <ElButton
            class="curation-primary"
            type={decision.value === 'reject' ? 'danger' : 'success'}
            disabled={!canSubmit.value}
            loading={submitting.value}
            onClick={submit}
          >
            {primaryLabel.value}
          </ElButton>
          <ElButton onClick={() => emit('next')}>Skip</ElButton>
          <span class="curation-muted ml-auto">J / K next · prev</span>
        </div>
      </div>
    )

    return () => {
      const t = term.value
      return (
        <aside class="curation-review-panel">
          {t ? (
            [renderHeader(t), renderUsage(t), renderDecision(), renderFooter(t)]
          ) : (
            <div class="curation-panel-section flex justify-end">
              <button class="curation-close" aria-label="Close" onClick={() => emit('close')}>
                ×
              </button>
            </div>
          )}
        </aside>
      )
    }
  },
})

export default CurationReviewPanel
