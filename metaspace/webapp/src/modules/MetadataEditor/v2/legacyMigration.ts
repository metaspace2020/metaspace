// metaspace/webapp/src/modules/MetadataEditor/v2/legacyMigration.ts
/* eslint-disable camelcase */
import { cloneDeep } from 'lodash-es'
import { appendProtocol, createEmptyEnvelope, POLARITY_TERMS, setAtPath } from './envelope'
import { fieldByKey, LEGACY_LABELS } from './formDefinition'
import {
  applyAliases,
  isPlaceholder,
  lookupTable,
  MATRIX_ALIASES,
  matrixApplication,
  normaliseText,
  parseSolvent,
  SOURCE_ALIASES,
  STABILISATION_TABLE,
  TISSUE_MODIFICATION_TABLE,
} from './legacyLookups'
import {
  FieldKey,
  FieldReport,
  LegacyMetadata,
  MetadataV2Envelope,
  MigrationResult,
  OntologyTermValue,
  Term,
  TermResolver,
  UnmappedRow,
} from './types'

export interface Resolution {
  value: OntologyTermValue
  state: 'migrated' | 'review'
  suggestion?: Term
  failed: boolean
}

const matches = (term: Term, text: string) =>
  [term.label, ...(term.synonyms || [])].some((s) => normaliseText(s) === text)

/**
 * Resolve legacy free text against a bound slot. Exact label/synonym match -> controlled; any hit ->
 * free text with a suggestion; no hit or request failure -> free text, review.
 */
export async function resolveTerm(slot: string, raw: string, resolver: TermResolver): Promise<Resolution> {
  const text = normaliseText(raw)
  const freeText: OntologyTermValue = { value_free_text: raw, curation_state: 'pending_curation' }
  let terms: Term[] = []
  try {
    terms = await resolver(slot, text)
  } catch (err) {
    return { value: freeText, state: 'review', failed: true }
  }
  const exact = terms.find((t) => matches(t, text))
  if (exact) {
    return {
      value: { value_ontology_id: exact.curie, value_label: exact.label, curation_state: 'controlled' },
      state: 'migrated',
      failed: false,
    }
  }
  return { value: freeText, state: 'review', suggestion: terms[0], failed: false }
}

const accepted = (label: string): OntologyTermValue => ({ value_label: label, curation_state: 'free_text_accepted' })
const pending = (text: string): OntologyTermValue => ({ value_free_text: text, curation_state: 'pending_curation' })

export async function migrateLegacy(
  legacy: LegacyMetadata,
  resolver: TermResolver,
  now: () => string = () => new Date().toISOString()
): Promise<MigrationResult> {
  let env: MetadataV2Envelope = createEmptyEnvelope('tissue')
  const fields: Partial<Record<FieldKey, FieldReport>> = {}
  const unmapped: UnmappedRow[] = []
  const failedSlots: string[] = []
  const protocolLines: string[] = []

  const si = legacy.Sample_Information || {}
  const sp = legacy.Sample_Preparation || {}
  const ms = legacy.MS_Analysis || {}
  const raw = (section: string, field: string, value: string | undefined) => ({
    legacyKey: `${section}.${field}`,
    raw: (value || '').trim(),
  })

  const put = (key: FieldKey, value: unknown, report: FieldReport) => {
    env = setAtPath(env, fieldByKey(key).path, value)
    fields[key] = report
  }
  const empty = (key: FieldKey, source?: { legacyKey: string; raw: string }) => {
    const required = fieldByKey(key).requiredFor !== 'none'
    fields[key] = { state: required ? 'required-empty' : 'empty', source: source?.raw ? source : undefined }
  }

  // Ontology-bound slot from a legacy string, with an optional alias step before resolution.
  const bound = async (key: FieldKey, source: { legacyKey: string; raw: string }, alias?: (s: string) => string) => {
    if (isPlaceholder(source.raw)) {
      empty(key, source)
      return
    }
    const def = fieldByKey(key)
    const query = alias ? alias(source.raw) : source.raw
    const res = await resolveTerm(def.slot!, query, resolver)
    if (res.failed) {
      failedSlots.push(def.slot!)
    }
    put(key, res.state === 'migrated' ? res.value : pending(source.raw), {
      state: res.state,
      source,
      suggestion: res.suggestion,
    })
  }

  // Unbound slot: lookup table hit -> free_text_accepted, else pending_curation.
  const tabled = (key: FieldKey, source: { legacyKey: string; raw: string }, table: Record<string, string>) => {
    if (isPlaceholder(source.raw) && lookupTable(source.raw, table) == null) {
      empty(key, source)
      return
    }
    const hit = lookupTable(source.raw, table)
    put(key, hit ? accepted(hit) : pending(source.raw), { state: hit ? 'migrated' : 'review', source })
  }

  const organism = raw('Sample_Information', 'Organism', si.Organism)
  const organismPart = raw('Sample_Information', 'Organism_Part', si.Organism_Part)
  const condition = raw('Sample_Information', 'Condition', si.Condition)
  const growth = raw('Sample_Information', 'Sample_Growth_Conditions', si.Sample_Growth_Conditions)
  const stabilisation = raw('Sample_Preparation', 'Sample_Stabilisation', sp.Sample_Stabilisation)
  const tissueMod = raw('Sample_Preparation', 'Tissue_Modification', sp.Tissue_Modification)
  const matrix = raw('Sample_Preparation', 'MALDI_Matrix', sp.MALDI_Matrix)
  const application = raw('Sample_Preparation', 'MALDI_Matrix_Application', sp.MALDI_Matrix_Application)
  const solvent = raw('Sample_Preparation', 'Solvent', sp.Solvent)
  const polarity = raw('MS_Analysis', 'Polarity', ms.Polarity)
  const source = raw('MS_Analysis', 'Ionisation_Source', ms.Ionisation_Source)
  const analyzer = raw('MS_Analysis', 'Analyzer', ms.Analyzer)
  const supplementary = raw('Additional_Information', 'Supplementary', legacy.Additional_Information?.Supplementary)

  fields.sample_type = { state: 'migrated', source: organismPart, note: 'inferred from legacy "Organism part"' }

  await Promise.all([
    bound('organism', organism),
    bound('anatomical_site_coarse', organismPart),
    bound('maldi_matrix', matrix, (s) => applyAliases(s, MATRIX_ALIASES)),
    bound('ionization_source', source, (s) => applyAliases(s, SOURCE_ALIASES)),
    (async () => {
      if (isPlaceholder(analyzer.raw)) {
        empty('instrument_model', analyzer)
        return
      }
      const res = await resolveTerm('instrument_model', analyzer.raw, resolver)
      if (res.failed) {
        failedSlots.push('instrument_model')
        put('instrument_model', pending(analyzer.raw), {
          state: 'review',
          source: analyzer,
          note: 'term lookup failed — kept as typed',
        })
      } else if (res.state === 'migrated') {
        put('instrument_model', res.value, { state: 'migrated', source: analyzer })
      } else {
        fields.instrument_model = {
          state: 'required-empty',
          source: analyzer,
          suggestion: res.suggestion,
          note: `legacy "Analyzer: ${analyzer.raw}" is an analyzer type, not a model — search "${analyzer.raw}" models`,
        }
      }
    })(),
    (async () => {
      if (isPlaceholder(solvent.raw)) {
        empty('solvent', solvent)
        return
      }
      const { compound, remainder } = parseSolvent(solvent.raw)
      if (!compound) {
        put('solvent', pending(solvent.raw), { state: 'review', source: solvent })
        return
      }
      const res = await resolveTerm('solvent', compound, resolver)
      if (res.failed) {
        failedSlots.push('solvent')
      }
      put('solvent', res.state === 'migrated' ? res.value : pending(compound), {
        state: res.state,
        source: solvent,
        suggestion: res.suggestion,
        note: remainder ? 'concentration kept in Protocol description' : undefined,
      })
      if (remainder) {
        protocolLines[1] = `Solvent: ${remainder}.`
      }
    })(),
  ])

  tabled('sample_stabilisation', stabilisation, STABILISATION_TABLE)
  tabled('tissue_modification', tissueMod, TISSUE_MODIFICATION_TABLE)

  if (isPlaceholder(application.raw)) {
    empty('maldi_matrix_application', application)
  } else {
    const { method, device } = matrixApplication(application.raw)
    put('maldi_matrix_application', method ? accepted(method) : pending(application.raw), {
      state: 'review',
      source: application,
      note: device ? 'device → method. Device kept in Protocol description.' : undefined,
    })
    if (device) {
      protocolLines[0] = `Matrix application device: ${device}.`
    }
  }

  const polarityKey = polarity.raw.toLowerCase()
  let unrecognisedPolarity = false
  if (polarityKey === 'positive' || polarityKey === 'negative') {
    put('polarity', POLARITY_TERMS[polarityKey === 'positive' ? 'Positive' : 'Negative'], {
      state: 'migrated',
      source: polarity,
    })
  } else if (isPlaceholder(polarity.raw)) {
    empty('polarity', polarity)
  } else {
    fields.polarity = { state: 'required-empty', source: polarity }
    unrecognisedPolarity = true
  }

  if (ms.Detector_Resolving_Power?.mz != null && ms.Detector_Resolving_Power?.Resolving_Power != null) {
    put('resolving_power', cloneDeep(ms.Detector_Resolving_Power), {
      state: 'migrated',
      source: raw(
        'MS_Analysis',
        'Detector_Resolving_Power',
        `${ms.Detector_Resolving_Power.Resolving_Power} @ ${ms.Detector_Resolving_Power.mz}`
      ),
    })
  } else if (ms.Detector_Resolving_Power) {
    const rp = ms.Detector_Resolving_Power
    env = setAtPath(env, 'unmodeled.Detector_Resolving_Power', {
      mz: rp.mz ?? null,
      Resolving_Power: rp.Resolving_Power ?? null,
    })
    fields.resolving_power = {
      state: 'required-empty',
      source: raw('MS_Analysis', 'Detector_Resolving_Power', `${rp.Resolving_Power ?? '?'} @ ${rp.mz ?? '?'}`),
    }
  } else {
    fields.resolving_power = { state: 'required-empty' }
  }
  if (ms.Pixel_Size?.Xaxis != null && ms.Pixel_Size?.Yaxis != null) {
    put('pixel_size', cloneDeep(ms.Pixel_Size), {
      state: 'migrated',
      source: raw('MS_Analysis', 'Pixel_Size', `${ms.Pixel_Size.Xaxis} × ${ms.Pixel_Size.Yaxis} µm`),
    })
  } else if (ms.Pixel_Size) {
    const px = ms.Pixel_Size
    env = setAtPath(env, 'unmodeled.Pixel_Size', { Xaxis: px.Xaxis ?? null, Yaxis: px.Yaxis ?? null })
    fields.pixel_size = {
      state: 'required-empty',
      source: raw('MS_Analysis', 'Pixel_Size', `${px.Xaxis ?? '?'} × ${px.Yaxis ?? '?'} µm`),
    }
  } else {
    fields.pixel_size = { state: 'required-empty' }
  }

  // Protocol description: growth conditions first, then device/solvent lines, then Supplementary.
  if (!isPlaceholder(growth.raw)) {
    env = appendProtocol(env, growth.raw)
  } else if (growth.raw !== '' || si.Sample_Growth_Conditions !== undefined) {
    unmapped.push({
      legacyKey: growth.legacyKey,
      label: LEGACY_LABELS[growth.legacyKey],
      raw: growth.raw,
      hint: 'Placeholder value — safe to dismiss',
      targets: ['protocol_description'],
      safeToDismiss: true,
    })
  }
  protocolLines.filter(Boolean).forEach((line) => {
    env = appendProtocol(env, line)
  })
  if (!isPlaceholder(supplementary.raw)) {
    env = appendProtocol(env, `Supplementary: ${supplementary.raw}.`)
  }
  const protocol = env.document.sample.protocol_description
  fields.protocol_description = protocol
    ? {
        state: 'review',
        note:
          'auto-composed from legacy "MALDI matrix application", "Solvent" and ' +
          '"Supplementary" details that have no v2 field — edit freely',
      }
    : { state: 'new' }

  // Condition has no single v2 home.
  if (condition.raw !== '' || si.Condition !== undefined) {
    const placeholder = isPlaceholder(condition.raw)
    unmapped.unshift({
      legacyKey: condition.legacyKey,
      label: LEGACY_LABELS[condition.legacyKey],
      raw: condition.raw,
      hint: placeholder
        ? 'Placeholder value — safe to dismiss'
        : 'Suggested: Disease · Genetic background · Health status · Protocol description',
      targets: ['disease', 'genetic_background', 'health_status', 'protocol_description'],
      safeToDismiss: placeholder,
    })
  }

  if (unrecognisedPolarity) {
    unmapped.push({
      legacyKey: polarity.legacyKey,
      label: LEGACY_LABELS[polarity.legacyKey],
      raw: polarity.raw,
      hint: 'Not a recognised polarity — pick Positive or Negative',
      targets: ['protocol_description'],
      safeToDismiss: false,
    })
  }

  const newKeys: FieldKey[] = [
    'anatomical_site_fine',
    'developmental_stage',
    'sex',
    'health_status',
    'genetic_background',
    'disease',
  ]
  newKeys.forEach((key) => {
    if (!fields[key]) {
      fields[key] = { state: 'new' }
    }
  })

  env = setAtPath(env, 'unmodeled.Supplementary', isPlaceholder(supplementary.raw) ? undefined : supplementary.raw)
  env = setAtPath(env, 'unmodeled.Submitted_By', legacy.Submitted_By)
  env = setAtPath(env, 'unmodeled.legacy_record', { metadata: cloneDeep(legacy), migrated_at: now() })

  return { envelope: env, fields, unmapped, failedSlots }
}
