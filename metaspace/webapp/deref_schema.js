var deref = require('json-schema-deref-sync');
var fs = require('fs');

var schemaPath = "metadata/min metadata schema.json";

fs.readFile(schemaPath, 'utf8', function(error, contents) {
    var schema = JSON.parse(contents);
    var dereferenced = deref(schema);
    console.log(JSON.stringify(dereferenced));
});
