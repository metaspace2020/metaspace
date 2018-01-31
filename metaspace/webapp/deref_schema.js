const deref = require('json-schema-deref-sync');
const mergeWith = require('lodash/mergeWith');
const fs = require('fs');
const path = require('path');


const minSchemaPath = "metadata/min metadata schema.json";
const specializedSchemasDir = "metadata/specialised metadata";
const metadataFileExtension = '.json';


function readJsonSchema(filePath) {
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return deref(schema);
}

function fileHasExtension(filename, extension) {
    return filename.substr(-extension.length).toLowerCase() == extension.toLowerCase();
}

function mergeCustomizer(objValue, srcValue) {
    if (Array.isArray(objValue)) {
        return objValue.concat(srcValue);
    }
}

if (process.argv.length != 3) {
    throw 'The script expects a single argument: a path to directory where metadata should be stored';
}

const outputDir = process.argv[2];
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

const minMetadata = readJsonSchema(minSchemaPath);

const dirFiles = fs.readdirSync(specializedSchemasDir);
for (const filename of dirFiles) {
    const filePath = path.join(specializedSchemasDir, filename);
    const fileStat = fs.lstatSync(filePath);
    if (!fileStat.isDirectory() && fileHasExtension(filename, metadataFileExtension)) {
        const specMetadata = readJsonSchema(filePath);
        const fullSchema = {};
        mergeWith(fullSchema, minMetadata, specMetadata, mergeCustomizer);
        fs.writeFileSync(path.join(outputDir, filename), JSON.stringify(fullSchema));
    }
}
