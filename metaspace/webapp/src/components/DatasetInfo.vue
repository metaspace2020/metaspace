<template>
  <el-row>
    <el-tree :data="getTreeData()"
             id="metadata-tree"
             node-key="id"
             default-expand-all>
    </el-tree>
  </el-row>
</template>

<script>
  import { defaultMetadataType, metadataSchemas } from '../assets/metadataRegistry';
  import { groupsProjectsQuery } from '../../src/api/dataset';
  import { get } from 'lodash-es';

 export default {
   name: 'dataset-info',
   props: ['metadata'],
   data() {
     	return {
	      dsGroup: this.$store.state.annotation.dataset.group,
        dsSubmitter: this.$store.state.annotation.dataset.submitter,
	      dsProjects: this.$store.state.annotation.dataset.projects
      }
   },
	 apollo: {
		 groupsProjects: {
			 query: groupsProjectsQuery,
			 skip: true,
			 variables() {
				 return {datasetId: this.$store.state.annotation.dataset.id}
			 },
			 update(data) {
			 	 // console.log('Call')
       }
		 }
	 },
   computed: {
     schema() {
       const metadataType = get(this.metadata, 'Metadata_Type')
         || this.$store.getters.filter.metadataType
         || defaultMetadataType;
       return metadataSchemas[metadataType];
     },

	   isSignedIn() {
		   return this.$store.state.authenticated;
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
     },

	   getTreeData() {
		   let schemaBasedVals = this.objToTreeNode(null, this.metadata, this.schema);
		   let groupName = this.dsGroup.name;
		   let submitterName = this.dsSubmitter.name;
		   let allProjects = this.dsProjects.map(e => e.name).join(', ');
		   let dataManagementChilds = [
         { id: "Submitter", label: `Submitter: ${submitterName}`},
			   { id: "Group", label: `Group: ${groupName}` }
       ];
		   if (this.isSignedIn) {
		   	 dataManagementChilds.push({ id: "Projects", label: `Projects: ${allProjects}` })
       }
		   schemaBasedVals.push({id: "Data Management", label: "Data Management", children: dataManagementChilds})
		   return schemaBasedVals
	   }
   }
 }
</script>

<style>
 #metadata-tree {
   text-align: left;
 }
</style>
