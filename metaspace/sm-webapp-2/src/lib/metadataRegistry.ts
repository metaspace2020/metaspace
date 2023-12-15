import metadataMapping from './metadataSchemas/metadataMapping';

export const metadataTypes = Object.keys(metadataMapping);

export const defaultMetadataType = metadataTypes.includes('Imaging MS') ? 'Imaging MS' : metadataTypes[0];

export const metadataSchemas: Record<string, any> = {};

async function loadMetadataSchemas() {
  for (const mdType of metadataTypes) {
    const mdFilename = metadataMapping[mdType];
    try {
      const response = await fetch(`./metadataSchemas/${mdFilename}`);
      if (!response.ok) {
        throw new Error(`Failed to load ${mdFilename}: ${response.statusText}`);
      }
      metadataSchemas[mdType] = await response.json();
    } catch (error) {
      // pass
      // console.error(`Error loading metadata schema for ${mdType}:`, error);
    }
  }
}

loadMetadataSchemas();

export default metadataSchemas;
