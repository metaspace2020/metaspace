const deref = require('json-schema-deref-sync');
const {mergeWith} = require('lodash');
const fs = require('fs');
const path = require('path');
const config = require('./src/clientConfig.json');


const minSchemaPath = "../metadata/min metadata schema.json";
const specializedSchemasDir = "../metadata/specialised metadata";
const metadataFileExtension = '.json';
const metadataMappingFilename = 'metadataMapping.js';

function readJsonSchema(filePath) {
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return deref(schema);
}

function filenameMatches(filename, allowedNames, allowedExt) {
    for (const name of allowedNames) {
        const allowedOption = name + allowedExt;
        if (filename.toLowerCase() === allowedOption.toLowerCase()) {
            return true;
        }
    }
    return false;
}

function mergeCustomizer(objValue, srcValue) {
    if (Array.isArray(objValue)) {
        return objValue.concat(srcValue);
    }
}

function derefSchema(outputDir) {

  if (!config.metadataTypes) {
    throw 'Allowed metadata types not found in "clientConfig.json"';
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  const minMetadata = readJsonSchema(minSchemaPath);

  const metadataFiles = {};
  const dirFiles = fs.readdirSync(specializedSchemasDir);
  for (const filename of dirFiles) {
    const filePath = path.join(specializedSchemasDir, filename);
    const fileStat = fs.lstatSync(filePath);
    if (!fileStat.isDirectory() && filenameMatches(filename, config.metadataTypes, metadataFileExtension)) {
      const specMetadata = readJsonSchema(filePath);
      const mdType = specMetadata['properties']['Data_Type']['enum'][0];
      const fullSchema = {};
      mergeWith(fullSchema, minMetadata, specMetadata, mergeCustomizer);
      fs.writeFileSync(path.join(outputDir, filename), JSON.stringify(fullSchema));
      metadataFiles[mdType] = filename;
    }
  }

  if (!metadataFiles) {
    throw 'No metadata schemas were found';
  }

  // create unified metadata registry
  const registryExportStmt = `export default ${JSON.stringify(metadataFiles)};`;
  fs.writeFileSync(path.join(outputDir, metadataMappingFilename), registryExportStmt);
}

if (require.main === module) {
  if (process.argv.length !== 3) {
    throw 'The script expects a single argument: a path to directory where metadata should be stored';
  }

  derefSchema(process.argv[2])
} else {
    module.exports = derefSchema;
}
