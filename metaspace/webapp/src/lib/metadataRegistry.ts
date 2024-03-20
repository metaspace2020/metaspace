import ims from './metadataSchemas/ims.json'
import lcms from './metadataSchemas/ims.json'

import metadataMapping from './metadataSchemas/metadataMapping'

export const metadataTypes = Object.keys(metadataMapping)

export const defaultMetadataType = metadataTypes.includes('Imaging MS') ? 'Imaging MS' : metadataTypes[0]

export const metadataSchemas: Record<string, any> = {
  'LC-MS': lcms,
  'Imaging MS': ims,
}
