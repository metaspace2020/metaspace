<template>
  <el-row>
    <el-tree :data="getTreeData"
             id="metadata-tree"
             node-key="id"
             @node-collapse="handleNodeCollapse"
             @node-expand="handleNodeExpand"
             :default-expanded-keys="expandedTreeNodes"
             auto-expand-parent>
    </el-tree>
  </el-row>
</template>

<script>
  import { defaultMetadataType, metadataSchemas } from '../assets/metadataRegistry';
  import { get } from 'lodash-es';

 export default {
   name: 'dataset-info',
   props: ['metadata', 'expandedKeys'],
   data() {
     	return {
	      schemaBasedVals: {},
	      expandAll: false,
	      expandedTreeNodes: [] || this.expandedKeys,
	      dsGroup: this.$store.state.annotation.dataset.group,
        dsSubmitter: this.$store.state.annotation.dataset.submitter,
	      dsProjects: this.$store.state.annotation.dataset.projects,
        dsPI: this.$store.state.annotation.dataset.principalInvestigator
      }
   },

   mounted() {
     if (Array.isArray(this.expandedTreeNodes) && !this.expandedTreeNodes.length) {
	     this.expandAll = true;
	     this.schemaBasedVals.forEach(node => this.getChildsWOLeafs(node, this.expandedTreeNodes));
     }
   },

   computed: {
     schema() {
       const metadataType = get(this.metadata, 'Metadata_Type')
         || this.$store.getters.filter.metadataType
         || defaultMetadataType;
       return metadataSchemas[metadataType];
     },

	   getTreeData() {
		   this.schemaBasedVals = this.objToTreeNode(null, this.metadata, this.schema);
		   let allProjects = this.dsProjects.map(e => e.name).join(', ');
		   let dataManagementChilds = [
			   { id: "Submitter", label: `Submitter: ${this.dsSubmitter.name}`},
			   { id: "Principal Investigator", label: `Principal Investigator: ${this.dsPI.name}`},
			   { id: "Group", label: `Group: ${this.dsGroup.name}` }
		   ];
		   if (this.isSignedIn) {
			   dataManagementChilds.push({ id: "Projects", label: `Projects: ${allProjects}` })
		   }
		   this.schemaBasedVals.push({id: "Data Management", label: "Data Management", children: dataManagementChilds});
		   return this.schemaBasedVals;
	   }
   },

   methods: {
	   getChildsWOLeafs(node, arrToCollect) {
		   if (Array.isArray(node.children) && node.children.length) {
			   arrToCollect.push(node.id);
			   node.children.forEach(child => {
				   this.getChildsWOLeafs(child, arrToCollect);
			   })
		   } else {
			   return false;
		   }
	   },

	   handleNodeCollapse(node) {
       let childs = [];
       this.getChildsWOLeafs(node, childs)
       for (let child of childs) {
         let nodeId = this.expandedTreeNodes.indexOf(child);
         if (nodeId !== -1) {
           this.expandedTreeNodes.splice(nodeId, 1);
         }
       }
		   this.$emit('event', this.expandedTreeNodes)
     },

	   handleNodeExpand(node) {
       this.expandedTreeNodes.push(node.id);
		   this.$emit('event', this.expandedTreeNodes)
	   },

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

	   isSignedIn() {
		   return this.$store.state.authenticated;
	   }
   }
 }
</script>

<style>
 #metadata-tree {
   text-align: left;
 }
</style>
