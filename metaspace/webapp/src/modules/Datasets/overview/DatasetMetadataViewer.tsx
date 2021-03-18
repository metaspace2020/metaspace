import { defineComponent, computed } from '@vue/composition-api'
import { get, isArray, isPlainObject, orderBy, range } from 'lodash'
import { defaultMetadataType, metadataSchemas } from '../../../lib/metadataRegistry'

interface DatasetMetadataViewerProps {
  metadata: Object
}

const cleanString = (str: string) =>
  str.toString()
    .replace(/_/g, ' ')
    .replace(/ [A-Z][a-z]/g, (x) => ' ' + x.slice(1).toLowerCase())
    .replace(/ freetext$/, '')
    .replace(/ table$/, '')
const newLinesToLineBreaks = (str: string) => {
  const parts = str.replace(/(\s*\n){2,}/g, '\n\n').split('\n')
  return range(parts.length * 2 - 1).map(i => i % 2 === 0 ? parts[i / 2] : <br />)
}
const customRenderers: Record<string, (val: any) => string | null> = {
  Detector_Resolving_Power: (rp: any) => {
    if (rp != null && rp.mz != null && rp.resolving_Power != null) {
      return `${(rp.Resolving_Power / 1000).toFixed(0)}k @ {rp.mz}`
    }
    return null
  },
  Pixel_Size: (pixelSize: any) => {
    if (pixelSize != null && pixelSize.Xaxis && pixelSize.Yaxis) {
      return `${pixelSize.Xaxis}μm × ${pixelSize.Yaxis}μm`
    }
    return null
  },
}
const cleanSectionContent = (content: any, schema: any): string | [string, string][] => {
  if (isPlainObject(content)) {
    let entries = Object.entries(content)
    if (schema != null) {
      entries = orderBy(entries, ([key]) => key in schema ? Object.keys(schema).indexOf(key) : 999)
    }
    if (entries.length === 1 && entries[0][0] === 'Supplementary') {
      return String(entries[0][1] || '')
    } else {
      return entries
        .map(([key, val]) =>
          [cleanString(key), key in customRenderers ? customRenderers[key](val) : val] as const)
        .filter(([key, val]) => val)
        .map(([key, val]) => [key, String(val)])
    }
  } else {
    return String(content || '')
  }
}

interface Props {
  metadata: any
}
export const DatasetMetadataViewer = defineComponent<DatasetMetadataViewerProps>({
  name: 'DatasetMetadataViewer',
  props: {
    metadata: { type: Object, default: {} },
  },
  setup(props: Props) {
    const schema = computed(() => {
      return metadataSchemas[get(props.metadata, 'Data_Type') || defaultMetadataType]
    })
    const sections = computed(() => {
      const schemaSections = schema.value.properties
      const s = Object.entries(props.metadata)
        .filter(([section]) => section !== 'Data_Type')
        .map(([section, sectionContent]) => [
          cleanString(section),
          cleanSectionContent(sectionContent, get(schemaSections, [section, 'properties'])),
        ] as const)
      return orderBy(s, ([key]) => key in schemaSections ? Object.keys(schemaSections).indexOf(key) : 999)
    })
    return () => {
      return (
        <div class="flex flex-wrap relative -m-3">
          {Array.isArray(sections?.value) && sections?.value.map(([section, sectionContent]) => (
            /* w-full sm:w-1/2 md:w-1/3 lg:w-1/2 xl:w-1/3 */
            <div key={section} class="flex-grow box-border min-w-64 p-3 break-words">
              {
                isArray(sectionContent)
                && <h3 class='m-0 my-2'>{section}</h3>
              }
              {isArray(sectionContent)
                ? <ul class="list-none p-0 m-0 max-h-40 overflow-y-auto">
                  {sectionContent.map(([key, value]) => value
                    ? <li key={key}><b>{key}:</b> {newLinesToLineBreaks(value)}</li>
                    : null)}
                </ul>
                : <p class="max-h-32 overflow-y-auto">{newLinesToLineBreaks(sectionContent)}</p>}
            </div>
          ))}
        </div>
      )
    }
  },
})
