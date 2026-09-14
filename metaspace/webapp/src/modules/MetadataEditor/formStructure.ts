/* eslint-disable camelcase */
import { cloneDeep, mapValues } from 'lodash-es'
import { Component } from 'vue'

export type Polarity = 'Positive' | 'Negative'
export type DetectorResolvingPower = { mz: number; Resolving_Power: number }
export type PixelSize = { Xaxis: number; Yaxis: number }
export type Person = { First_Name: string; Last_Name: string; Email: string }

// metadata schema v2 - mirrors OntologyTermValue in the LinkML schema (and graphql's
// projection.ts). The structural free-text escape hatch: every ontology-bound slot ranges over
// this shape rather than a plain string, so an unresolved value is recorded, never rejected.
export type CurationState = 'controlled' | 'pending_curation' | 'free_text_accepted'
export type OntologyTermValue = {
  value_ontology_id?: string | null
  value_label?: string | null
  value_free_text?: string | null
  curation_state: CurationState
}

// Progressive-disclosure tier (metadata schema v2 - mirrors the LinkML schema's per-slot `tier`
// annotation): core blocks submission, recommended is nudged but non-blocking, extension is
// niche/facility and collapsed by default. Orthogonal to JSON Schema's native `required`. Absent on
// the legacy ims.json/lcms.json schemas (defaulted to 'core' in deriveSection below), so every
// existing field keeps behaving exactly as it does today until the new schema actually sets this.
export type MetadataTier = 'core' | 'recommended' | 'extension'

export interface JsonSchemaProperty {
  type?: 'string' | 'boolean' | 'array' | 'object'
  enum?: any[]
  items?: JsonSchemaProperty
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
  title?: string
  description?: string
  smEditorType?: FormFieldEditorType
  smEditorColWidth?: number
  help?: string
  tier?: MetadataTier
}

export type FormFieldEditorType =
  | 'textarea'
  | 'select'
  | 'autocomplete'
  | 'checkbox'
  | 'table'
  | 'selectMulti'
  | 'person'
  | 'detectorResolvingPower'
  | 'text'
  | 'pixelSize'
  // metadata schema v2 - see OntologyTermInput.vue. Ranges over an OntologyTermValue object
  // ({value_ontology_id, value_label, value_free_text, curation_state}), not a plain string -
  // declared explicitly via `smEditorType` in the schema (same precedent as `pixelSize`), never
  // inferred by getFieldType().
  | 'ontologyTerm'

export interface FormFieldProperty extends JsonSchemaProperty {
  title: string
  smEditorType: FormFieldEditorType
  smEditorColWidth: number
  smEditorHelp?: Component
  tier: MetadataTier
}

export interface FormSectionProperty extends JsonSchemaProperty {
  type: 'object'
  properties: Record<string, FormFieldProperty>
  title: string
}

export interface DataTypeSectionProperty extends JsonSchemaProperty {
  type: 'string'
}

export interface FormSchema extends JsonSchemaProperty {
  properties: {
    [sectionKey: string]: FormSectionProperty | DataTypeSectionProperty
  }
}

export interface MetaspaceOptions {
  name: string
  isPublic: boolean
  performEnrichment: boolean
  databaseIds: number[]
  ontologyDbIds: number[]
  adducts: string[]
  neutralLosses: string[]
  chemMods: string[]
  groupId: string | null
  projectIds: string[]
  principalInvestigator: {
    name: string
    email: string
  } | null
  analysisVersion: number
  scoringModelId: number
  ppm: number
  numPeaks: number
  decoySampleSize: number
}

const FIELD_WIDTH: Record<string, number> = {
  Submitter: 8,
  Supplementary: 16,
  Email: 24,
  Polarity: 4,
  Ionisation_Source: 8,
  Analyzer: 8,
  Detector_Resolving_Power: 17,
  Pixel_Size: 17,
  Dataset_Name: 12,
  Solvent_A_Table: 24,
  Solvent_B_Table: 24,
  Gradient_Table: 24,
}

function prettify(propName: string) {
  return propName
    .replace(/_/g, ' ')
    .replace(/ [A-Z][a-z]/g, (x) => ' ' + x.slice(1).toLowerCase())
    .replace(/( freetext$| table$)/, '')
    .replace('metaspace', 'METASPACE')
    .trim()
}

function getFieldType(prop: JsonSchemaProperty, propName: string): FormFieldEditorType {
  if (prop.type === 'string') {
    if (propName.endsWith('Freetext')) {
      return 'textarea'
    } else if (prop.enum) {
      return 'select'
    } else if (propName !== 'Dataset_Name' && propName !== 'Email') {
      return 'autocomplete'
    }
  } else if (prop.type === 'boolean') {
    return 'checkbox'
  } else if (prop.type === 'array') {
    if (propName.endsWith('Table')) {
      return 'table'
    } else {
      return 'selectMulti'
    }
  } else if (prop.type === 'object') {
    if (prop.properties && prop.properties.First_Name != null) {
      return 'person'
    } else if (prop.properties && prop.properties.Resolving_Power != null) {
      return 'detectorResolvingPower'
    }
  }
  return 'text'
}

function getWidth(propName: string) {
  if (propName.endsWith('Freetext')) {
    return 16
  }
  return FIELD_WIDTH[propName] || 8
}

function deriveSection(section: JsonSchemaProperty, sectionKey: string): FormSectionProperty | DataTypeSectionProperty {
  if (section.type === 'string') {
    return section as DataTypeSectionProperty
  } else if (section.type === 'object') {
    const derivedSection: FormSectionProperty = {
      ...section,
      type: 'object',
      title: section.title || prettify(sectionKey),
      properties: mapValues(section.properties, (field: any, fieldKey: string) => ({
        ...field,
        smEditorType: field.smEditorType || getFieldType(field, fieldKey),
        smEditorColWidth: field.smEditorColWidth || getWidth(fieldKey),
        title: field.title || prettify(fieldKey),
        tier: field.tier || 'core',
      })),
      help: section.help,
    } as FormSectionProperty
    return derivedSection
  } else {
    throw new Error(`Could not derive type of section ${sectionKey}`)
  }
}

export function deriveFullSchema(schema: JsonSchemaProperty): FormSchema {
  // TODO: Move all this information into custom attributes in the schema instead of inspecting the data/name/etc.
  const clonedSchema = cloneDeep(schema) || {}

  if (!clonedSchema?.properties) {
    console.error('Cloned schema properties undefined')
    return clonedSchema as FormSchema
  }

  return {
    ...clonedSchema,
    properties: mapValues(clonedSchema.properties, deriveSection),
  } as FormSchema
}
