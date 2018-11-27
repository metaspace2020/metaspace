import metadataMapping from './metadataMapping';

export const metadataTypes = Object.keys(metadataMapping);

export const defaultMetadataType = metadataTypes.includes("Imaging MS") ? "Imaging MS" : metadataTypes[0];

export const metadataSchemas: Record<string, any> = {};

for (const mdType of metadataTypes) {
  const mdFilename = metadataMapping[mdType];
  metadataSchemas[mdType] = require(`./${mdFilename}`);
}
