/* eslint-disable camelcase */
import { computed, ComputedRef, ref, Ref } from 'vue'
import { cloneDeep, isEqual } from 'lodash-es'
import safeJsonParse from '../../../lib/safeJsonParse'
import {
  createEmptyEnvelope,
  emptyTermValue,
  getAtPath,
  SAMPLE_CLASS,
  polarityOf,
  setAtPath,
  switchSampleType,
  unsetAtPath,
} from './envelope'
import { curatedValueResolver } from './curatedValues'
import { mapServerErrors } from './errorPaths'
import { ENUM_VALUES, FieldDef, fieldByKey, fieldsFor, requiredFor } from './formDefinition'
import { migrateLegacy } from './legacyMigration'
import { computeStatus, StatusSummary } from './status'
import {
  EditorMode,
  FieldKey,
  FieldReport,
  LegacyMetadata,
  MetadataV2Envelope,
  ResolvingPower,
  SampleType,
  TermResolver,
  ValueResolver,
  UnmappedRow,
} from './types'

export interface DatasetForLoad {
  id: string
  metadataV2Json?: string | null
  metadataJson?: string | null
  uploadDT?: string | null
  submitter?: { name?: string | null } | null
}

export interface MetadataV2Form {
  mode: Ref<EditorMode>
  datasetId: Ref<string | null>
  envelope: Ref<MetadataV2Envelope>
  initialEnvelope: Ref<MetadataV2Envelope | null>
  legacy: Ref<LegacyMetadata | null>
  legacyMeta: Ref<{ uploadDT: string | null; submitterName: string | null }>
  fields: Ref<Partial<Record<FieldKey, FieldReport>>>
  unmapped: Ref<UnmappedRow[]>
  failedSlots: Ref<string[]>
  fieldErrors: Ref<Partial<Record<FieldKey, string>>>
  otherErrors: Ref<string[]>
  /** true after a submit was attempted with gaps: every missing required field is then shown in red */
  submitAttempted: Ref<boolean>
  view: Ref<'v2' | 'legacy'>
  focusRequest: Ref<{ key: FieldKey; prefill?: string; seq: number } | null>
  /** the sample type that drives the layout: the chosen one, or the last chosen while the select is cleared */
  sampleType: ComputedRef<SampleType>
  visibleFields: ComputedRef<FieldDef[]>
  status: ComputedRef<StatusSummary>
  polarity: ComputedRef<'Positive' | 'Negative' | null>
  resolvingPower: ComputedRef<ResolvingPower | null>
  isDirty: ComputedRef<boolean>
  hasLegacyRecord: ComputedRef<boolean>
  loadNew(seed?: { metadataV2Json?: string | null; metadataJson?: string | null }): Promise<void>
  loadDataset(dataset: DatasetForLoad): Promise<void>
  setField(key: FieldKey, value: unknown): void
  setSampleType(type: SampleType | null): void
  /** stores a typed sample type for curation; the layout keeps the current class (tissue when none) */
  setSampleTypeOther(text: string): void
  requestFocus(key: FieldKey, prefill?: string): void
  setServerErrors(errors: { dataPath: string; message: string }[]): void
  clearFieldError(key: FieldKey): void
  markSubmitAttempt(): void
  serialize(datasetName: string): string
  /** the resolver the form was created with; field editors use it for live search */
  resolver: TermResolver
  /** suggestions for the free-text fields without ontology (curated + community values) */
  valueResolver: ValueResolver
}

/** What a sample-type switch hid from the class the user left, so selecting that class again restores it. */
interface ClassStash {
  values: Partial<Record<FieldKey, unknown>>
  reports: Partial<Record<FieldKey, FieldReport>>
}

const parseEnvelope = (json: string | null | undefined): MetadataV2Envelope | null => {
  const parsed = json ? safeJsonParse(json) : null
  if (!parsed || typeof parsed !== 'object' || !parsed.document || !parsed.unmodeled) {
    return null
  }
  const base = createEmptyEnvelope(parsed.document.sample?.sample_type || 'tissue')
  return {
    document: { ...base.document, ...parsed.document },
    unmodeled: { ...base.unmodeled, ...parsed.unmodeled },
  }
}

/** Narrows a string to one of the curated sample types (ENUM_VALUES is typed as plain strings). */
const isSampleType = (value: string): value is SampleType => ENUM_VALUES.SampleType.includes(value)

/** A template never inherits provenance or submitter data from its source dataset. */
const stripForTemplate = (env: MetadataV2Envelope): MetadataV2Envelope => {
  const next = cloneDeep(env)
  delete next.unmodeled.legacy_record
  delete next.unmodeled.Submitted_By
  delete next.unmodeled.Supplementary
  delete next.document.dataset_name
  return next
}

export function useMetadataV2Form(
  resolver: TermResolver,
  valueResolver: ValueResolver = curatedValueResolver
): MetadataV2Form {
  const mode = ref<EditorMode>('new')
  const datasetId = ref<string | null>(null)
  const envelope = ref<MetadataV2Envelope>(createEmptyEnvelope())
  const initialEnvelope = ref<MetadataV2Envelope | null>(null)
  const legacy = ref<LegacyMetadata | null>(null)
  const legacyMeta = ref({ uploadDT: null as string | null, submitterName: null as string | null })
  const fields = ref<Partial<Record<FieldKey, FieldReport>>>({})
  const unmapped = ref<UnmappedRow[]>([])
  const failedSlots = ref<string[]>([])
  const fieldErrors = ref<Partial<Record<FieldKey, string>>>({})
  const otherErrors = ref<string[]>([])
  const submitAttempted = ref(false)
  const view = ref<'v2' | 'legacy'>('v2')
  const focusRequest = ref<{ key: FieldKey; prefill?: string; seq: number } | null>(null)
  const lastSampleType = ref<SampleType>('tissue')
  // the sample_type report as it was before the select was cleared, restored when a type is picked again
  let clearedSampleTypeReport: FieldReport | undefined
  // values (and their reports) a sample-type switch hid, per class they belong to; in memory only, never serialized
  const classStash = new Map<SampleType, ClassStash>()
  let focusSeq = 0

  const sampleType = computed(() => envelope.value.document.sample.sample_type || lastSampleType.value)
  const visibleFields = computed(() => fieldsFor(sampleType.value))
  const status = computed(() =>
    computeStatus({
      envelope: envelope.value,
      sampleType: sampleType.value,
      fields: fields.value,
    })
  )
  const polarity = computed(() => polarityOf(envelope.value))
  const resolvingPower = computed(() => envelope.value.unmodeled.Detector_Resolving_Power || null)
  const isDirty = computed(() => initialEnvelope.value != null && !isEqual(envelope.value, initialEnvelope.value))
  const hasLegacyRecord = computed(() => legacy.value != null)

  const reset = () => {
    fields.value = {}
    unmapped.value = []
    failedSlots.value = []
    fieldErrors.value = {}
    otherErrors.value = []
    submitAttempted.value = false
    view.value = 'v2'
    lastSampleType.value = 'tissue'
    clearedSampleTypeReport = undefined
    legacy.value = null
    legacyMeta.value = { uploadDT: null, submitterName: null }
    classStash.clear()
  }

  const loadNew: MetadataV2Form['loadNew'] = async (seed = {}) => {
    reset()
    mode.value = 'new'
    datasetId.value = null
    const fromV2 = parseEnvelope(seed.metadataV2Json)
    if (fromV2) {
      envelope.value = stripForTemplate(fromV2)
    } else if (seed.metadataJson && safeJsonParse(seed.metadataJson)?.Sample_Information) {
      // a template copies values only: migration provenance (tags, hints) belongs to editing
      // the legacy dataset itself, so fields/unmapped/failedSlots stay as reset() left them
      const result = await migrateLegacy(safeJsonParse(seed.metadataJson), resolver)
      envelope.value = stripForTemplate(result.envelope)
    } else {
      // no default sample type: the select shows its placeholder (required, unfilled) and the layout follows
      // lastSampleType (tissue) until the user picks one
      envelope.value = unsetAtPath(createEmptyEnvelope(), 'document.sample.sample_type')
    }
    // sample_class (optional in the schema) is only stored alongside a chosen sample type
    if (!envelope.value.document.sample.sample_type) {
      envelope.value = unsetAtPath(envelope.value, 'document.sample.sample_class')
    }
    initialEnvelope.value = cloneDeep(envelope.value)
  }

  const loadDataset: MetadataV2Form['loadDataset'] = async (dataset) => {
    reset()
    datasetId.value = dataset.id
    legacyMeta.value = { uploadDT: dataset.uploadDT || null, submitterName: dataset.submitter?.name || null }
    const fromV2 = parseEnvelope(dataset.metadataV2Json)
    if (fromV2) {
      mode.value = 'v2'
      envelope.value = fromV2
      legacy.value = fromV2.unmodeled.legacy_record?.metadata || null
    } else {
      mode.value = 'legacy'
      const legacyMetadata: LegacyMetadata = safeJsonParse(dataset.metadataJson || '') || {}
      legacy.value = legacyMetadata
      const result = await migrateLegacy(legacyMetadata, resolver)
      envelope.value = result.envelope
      fields.value = result.fields
      unmapped.value = result.unmapped
      failedSlots.value = result.failedSlots
    }
    initialEnvelope.value = cloneDeep(envelope.value)
  }

  const markSubmitAttempt: MetadataV2Form['markSubmitAttempt'] = () => {
    submitAttempted.value = true
  }

  const clearFieldError = (key: FieldKey) => {
    if (fieldErrors.value[key]) {
      const next = { ...fieldErrors.value }
      delete next[key]
      fieldErrors.value = next
    }
  }

  const setField: MetadataV2Form['setField'] = (key, value) => {
    const def = fieldByKey(key)
    const path = def.path
    if (value === undefined || value === null) {
      // optional fields are removed (the schema rejects null); required ones fall back to the empty term
      const isRequired = requiredFor(sampleType.value).some((f) => f.key === key)
      envelope.value = isRequired
        ? setAtPath(envelope.value, path, emptyTermValue())
        : unsetAtPath(envelope.value, path)
    } else {
      envelope.value = setAtPath(envelope.value, path, value)
    }
    clearFieldError(key)
    const report = fields.value[key]
    if (report && report.state !== 'migrated') {
      const next = { ...fields.value }
      delete next[key]
      fields.value = next
    }
  }

  /** Drops reports of fields the given sample type does not show, so they stop counting. */
  const pruneHiddenReports = (type: SampleType) => {
    const visible = new Set(fieldsFor(type).map((f) => f.key))
    const next = { ...fields.value }
    ;(Object.keys(next) as FieldKey[]).forEach((key) => {
      if (!visible.has(key)) delete next[key]
    })
    fields.value = next
  }

  /** Drops the typed sample type; picking or clearing the select replaces it. */
  const clearSampleTypeOther = () => {
    if (envelope.value.unmodeled.sample_type_other !== undefined) {
      envelope.value = unsetAtPath(envelope.value, 'unmodeled.sample_type_other')
    }
  }

  /** Drops the sample_type migration report: the value is now the user's own. */
  const dropSampleTypeReport = () => {
    if (fields.value.sample_type) {
      const next = { ...fields.value }
      delete next.sample_type
      fields.value = next
    }
  }

  /** Remembers the values of `from` that the `to` layout hides, with their reports. */
  const stashHiddenValues = (from: SampleType, to: SampleType) => {
    const kept = new Set(fieldsFor(to).map((f) => f.key))
    const entry: ClassStash = { values: {}, reports: {} }
    fieldsFor(from)
      .filter((def) => !kept.has(def.key))
      .forEach((def) => {
        const value = getAtPath(envelope.value, def.path)
        if (value !== undefined) entry.values[def.key] = cloneDeep(value)
        if (fields.value[def.key]) entry.reports[def.key] = fields.value[def.key]
      })
    classStash.set(from, entry)
  }

  /** Puts back what was stashed for `type` (only keys the class shows) and forgets the stash. */
  const restoreStashedValues = (type: SampleType) => {
    const entry = classStash.get(type)
    if (!entry) return
    classStash.delete(type)
    const applies = new Set(fieldsFor(type).map((f) => f.key))
    let next = envelope.value
    ;(Object.keys(entry.values) as FieldKey[]).forEach((key) => {
      if (applies.has(key)) next = setAtPath(next, fieldByKey(key).path, entry.values[key])
    })
    envelope.value = next
    const reports = { ...fields.value }
    ;(Object.keys(entry.reports) as FieldKey[]).forEach((key) => {
      if (applies.has(key)) reports[key] = entry.reports[key]
    })
    fields.value = reports
  }

  const setSampleType: MetadataV2Form['setSampleType'] = (type) => {
    clearSampleTypeOther()
    const current = envelope.value.document.sample.sample_type
    if (type == null) {
      if (!current) return
      // keep every other sample value and the current layout; only the select becomes required-empty
      lastSampleType.value = current
      clearedSampleTypeReport = fields.value.sample_type
      envelope.value = unsetAtPath(envelope.value, 'document.sample.sample_type')
      fields.value = { ...fields.value, sample_type: { state: 'required-empty' } }
      return
    }
    if (!current) {
      // re-picking after a clear: restore the report the select had before
      const next = { ...fields.value }
      if (clearedSampleTypeReport) next.sample_type = clearedSampleTypeReport
      else delete next.sample_type
      fields.value = next
      clearedSampleTypeReport = undefined
    }
    if (type === (current || lastSampleType.value)) {
      envelope.value = setAtPath(envelope.value, 'document.sample', {
        ...envelope.value.document.sample,
        sample_class: SAMPLE_CLASS[type],
        sample_type: type,
      })
    } else {
      stashHiddenValues(current || lastSampleType.value, type)
      envelope.value = switchSampleType(envelope.value, type)
      pruneHiddenReports(type)
      restoreStashedValues(type)
      // a different type is a user edit: drop the migration report ("inferred from legacy …" / migrated)
      dropSampleTypeReport()
    }
    lastSampleType.value = type
    clearFieldError('sample_type')
  }

  const setSampleTypeOther: MetadataV2Form['setSampleTypeOther'] = (raw) => {
    const text = (raw || '').trim()
    if (!text) return
    // a typed value that is just a curated type spelled differently ("TISSUE", "cell culture") selects it
    const key = text.toLowerCase().replace(/[\s-]+/g, '_')
    const curated: SampleType | undefined = isSampleType(key) ? key : undefined
    if (curated) {
      setSampleType(curated)
      return
    }
    // keep the layout the user is looking at: the current class, or the one shown while the select is cleared
    const type = sampleType.value
    envelope.value = setAtPath(
      setAtPath(envelope.value, 'document.sample', {
        ...envelope.value.document.sample,
        sample_class: SAMPLE_CLASS[type],
        sample_type: type,
      }),
      'unmodeled.sample_type_other',
      { value_free_text: text, curation_state: 'pending_curation' }
    )
    lastSampleType.value = type
    clearedSampleTypeReport = undefined
    // a typed value is a user edit: no migration tag or "inferred from legacy" hint
    dropSampleTypeReport()
    clearFieldError('sample_type')
  }

  const requestFocus: MetadataV2Form['requestFocus'] = (key, prefill) => {
    view.value = 'v2'
    focusRequest.value = { key, prefill, seq: ++focusSeq }
  }

  const setServerErrors: MetadataV2Form['setServerErrors'] = (errors) => {
    const mapped = mapServerErrors(errors || [])
    fieldErrors.value = mapped.fieldErrors
    otherErrors.value = mapped.otherErrors
  }

  const serialize: MetadataV2Form['serialize'] = (datasetName) =>
    JSON.stringify(setAtPath(envelope.value, 'document.dataset_name', datasetName || undefined))

  return {
    mode,
    datasetId,
    envelope,
    initialEnvelope,
    legacy,
    legacyMeta,
    fields,
    unmapped,
    failedSlots,
    fieldErrors,
    otherErrors,
    submitAttempted,
    view,
    focusRequest,
    sampleType,
    visibleFields,
    status,
    polarity,
    resolvingPower,
    isDirty,
    hasLegacyRecord,
    loadNew,
    loadDataset,
    setField,
    setSampleType,
    setSampleTypeOther,
    requestFocus,
    setServerErrors,
    clearFieldError,
    markSubmitAttempt,
    serialize,
    resolver,
    valueResolver,
  }
}
