/* eslint-disable camelcase */
import { cloneDeep, mapValues } from 'lodash-es'
import { Component } from 'vue'

export type Polarity = 'Positive' | 'Negative';
export type DetectorResolvingPower = { mz: number; Resolving_Power: number; };
export type PixelSize = { Xaxis: number; Yaxis: number; }
export type Person = { First_Name: string; Last_Name: string; Email: string; };

export interface JsonSchemaProperty {
  type?: 'string' | 'boolean' | 'array' | 'object';
  enum?: any[];
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  title?: string;
  description?: string;
  smEditorType?: FormFieldEditorType;
  smEditorColWidth?: number;
  help?: string;
}

export type FormFieldEditorType = 'textarea' | 'select' | 'autocomplete' | 'checkbox' | 'table' | 'selectMulti'
  | 'person' | 'detectorResolvingPower' | 'text' | 'pixelSize';

export interface FormFieldProperty extends JsonSchemaProperty {
  title: string;
  smEditorType: FormFieldEditorType;
  smEditorColWidth: number;
  smEditorHelp?: Component;
}

export interface FormSectionProperty extends JsonSchemaProperty {
  type: 'object';
  properties: Record<string, FormFieldProperty>;
  title: string;
}

export interface DataTypeSectionProperty extends JsonSchemaProperty {
  type: 'string';
}

export interface FormSchema extends JsonSchemaProperty {
  properties: {
    [sectionKey: string]: FormSectionProperty | DataTypeSectionProperty;
  };
}

export interface MetaspaceOptions {
  name: string;
  isPublic: boolean;
  performEnrichment: boolean;
  databaseIds: number[];
  adducts: string[];
  neutralLosses: string[];
  chemMods: string[];
  groupId: string | null;
  projectIds: string[];
  principalInvestigator: {
    name: string;
    email: string;
  } | null;
  analysisVersion: number;
  scoringModel: string;
  ppm: number;
  numPeaks: number;
  decoySampleSize: number;
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
      properties: mapValues(section.properties, (field, fieldKey) => ({
        ...field,
        smEditorType: field.smEditorType || getFieldType(field, fieldKey),
        smEditorColWidth: field.smEditorColWidth || getWidth(fieldKey),
        title: field.title || prettify(fieldKey),
      })),
      help: section.help,
    }
    return derivedSection
  } else {
    throw new Error(`Could not derive type of section ${sectionKey}`)
  }
}

export function deriveFullSchema(schema: JsonSchemaProperty): FormSchema {
  // TODO: Move all this information into custom attributes in the schema instead of inspecting the data/name/etc.
  const clonedSchema = cloneDeep(schema)
  return {
    ...clonedSchema,
    properties: mapValues(clonedSchema.properties, deriveSection),
  }
}
