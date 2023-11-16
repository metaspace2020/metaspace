import metadataMapping from './metadataSchemas/metadataMapping';

export const metadataTypes = Object.keys(metadataMapping);

export const defaultMetadataType = metadataTypes.includes('Imaging MS') ? 'Imaging MS' : metadataTypes[0];

export const metadataSchemas: Record<string, any> = {};

// Use an async function to load metadata schemas
export async function loadMetadataSchemas() {
  for (const mdType of metadataTypes) {
    const mdFilename = (metadataMapping as Record<string, string>)[mdType];

    metadataSchemas[mdType] = await import(
      /* @vite-ignore */
    './metadataSchemas/'+ mdFilename);
  }
}

