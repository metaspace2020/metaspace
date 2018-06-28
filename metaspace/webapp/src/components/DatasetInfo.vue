<template>
  <el-row>
    <div v-if="!valid">
      <span class="invalid">
      Metadata does not conform to the schema:
      </span>
      <ul>
        <li v-for="error in validationErrors">
          {{ error.dataPath }}: {{ error.message }}
        </li>
      </ul>
    </div>

    <el-tree :data="treeData"
             id="metadata-tree"
             node-key="id"
             :default-expanded-keys="defaultExpandedKeys">
    </el-tree>
  </el-row>
</template>

<script>
 import metadataSchema from '../assets/metadata_schema.json';
 import Ajv from 'ajv';

 const ajv = new Ajv();
 const validator = ajv.compile(metadataSchema);

 export default {
   name: 'dataset-info',
   props: ['metadata', 'expandedKeys'],
   data() {
     return {
       schema: metadataSchema,
       validator,
       defaultExpandedKeys: this.expandedKeys
     }
   },
   computed: {
     valid () { return validator(this.metadata); },
     validationErrors() { return validator.errors; },
     treeData() {
       return this.objToTreeNode(null, this.metadata, this.schema);
     }
   },
   methods: {

     prettify(str) {
       return str.toString()
                 .replace(/_/g, ' ')
                 .replace(/ [A-Z][a-z]/g, (x) => ' ' + x.slice(1).toLowerCase())
                 .replace(/ freetext$/, '')
                 .replace('metaspace', 'METASPACE');
     },

     objToTreeNode(label, obj, schema) {
       let children = [];
       let isLeaf = true;
       for (let key in schema.properties) {
         const data = obj[key];
         isLeaf = false;
         const childSchema = schema.properties[key];
         if (!data || key == 'Email') // hide e-mails from the interface
           continue;
         const child = this.objToTreeNode(key, data, childSchema);
         if (child.children && child.children.length == 0)
           continue;
         children.push(child);
       }

       if (label === null)
         return children;

       label = this.prettify(label);
       const id = label;
       if (isLeaf)
         return { id, label: label + ': ' + this.prettify(obj) };

       return { id, label, children };
     }
   }
 }
</script>

<style>
 .valid {
   background-color: #afa
 }

 .invalid {
   background-color: #a88
 }

 #metadata-tree {
   text-align: left;
 }
</style>
