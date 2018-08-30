<template>
  <el-row>
    <el-tree :data="treeData"
             id="metadata-tree"
             node-key="id"
             :default-expanded-keys="defaultExpandedKeys">
    </el-tree>
  </el-row>
</template>

<script>
  import { defaultMetadataType, metadataSchemas } from '../assets/metadataRegistry';
  import {get} from 'lodash-es';

 export default {
   name: 'dataset-info',
   props: ['metadata', 'expandedKeys'],
   data() {
     return {
       defaultExpandedKeys: this.expandedKeys
     }
   },
   computed: {
     schema() {
       const metadataType = get(this.metadata, 'Metadata_Type')
         || this.$store.getters.filter.metadataType
         || defaultMetadataType;
       return metadataSchemas[metadataType];
     },
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
                 .replace(/ table$/, '')
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
         return { id, label: `${label}: ${Array.isArray(obj) ? JSON.stringify(obj) : this.prettify(obj)}` };

       return { id, label, children };
     }
   }
 }
</script>

<style>
 #metadata-tree {
   text-align: left;
 }
</style>
