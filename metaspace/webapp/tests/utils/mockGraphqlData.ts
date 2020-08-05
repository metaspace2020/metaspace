
export const mockAdductSuggestions = () => [
  // Positive mode
  { adduct: '+H', name: '[M + H]⁺', charge: 1, hidden: false, default: true },
  { adduct: '+Na', name: '[M + Na]⁺', charge: 1, hidden: false, default: true },
  { adduct: '+K', name: '[M + K]⁺', charge: 1, hidden: false, default: true },
  { adduct: '[M]+', name: '[M]⁺', charge: 1, hidden: true, default: false },
  // Negative mode
  { adduct: '-H', name: '[M - H]⁻', charge: -1, hidden: false, default: true },
  { adduct: '+Cl', name: '[M + Cl]⁻', charge: -1, hidden: false, default: true },
  { adduct: '[M]-', name: '[M]⁻', charge: -1, hidden: true, default: false },
]

const publicDatabase = { id: 1, name: 'foo', version: 'v1', group: null }
const groupDatabase = { id: 2, name: 'bar', version: 'v1', group: { id: '123' } }

export const mockMolecularDatabases = () => [
  publicDatabase,
  groupDatabase,
]

export const mockPublicMolecularDBs = () => [
  publicDatabase,
]

export const mockMolDBsByGroup = () => ({
  groups: [
    {
      group: {
        id: '123',
        shortName: 'test',
        molecularDatabases: [
          groupDatabase,
        ],
      },
    },
  ],
})
