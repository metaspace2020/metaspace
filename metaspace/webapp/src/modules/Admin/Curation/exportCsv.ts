import { CurationTerm } from '../../../api/metadataCuration'
import { slotOption } from './slotLabels'

const HEADER = [
  'typed_term',
  'field',
  'vocabulary',
  'status',
  'dataset_id',
  'dataset_name',
  'submitter',
  'submitted',
  'suggested_label',
  'suggested_id',
  'suggested_score',
  'canonical_label',
  'ontology_id',
  'note',
]

/** RFC 4180: a field with a comma, quote or line break is quoted and its quotes doubled */
const csvField = (value: string | number | null | undefined): string => {
  if (value == null) return ''
  // spreadsheet apps run text starting with = + - @ tab or CR as a formula: neutralise user-submitted strings
  const text = typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function curationTermsToCsv(terms: CurationTerm[]): string {
  const rows = terms.map((term) => {
    const option = slotOption(term.slot)
    return [
      term.text,
      option.label,
      option.vocabulary,
      term.status,
      term.datasetId,
      term.datasetName,
      term.submitter?.name,
      term.submittedAt,
      term.suggestedLabel,
      term.suggestedOntologyId,
      term.suggestedScore,
      term.canonicalLabel,
      term.ontologyId,
      term.note,
    ]
      .map(csvField)
      .join(',')
  })
  return [HEADER.join(','), ...rows].join('\r\n') + '\r\n'
}

export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
