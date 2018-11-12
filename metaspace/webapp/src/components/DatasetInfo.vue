<template>
  <el-row>
    <el-tree :data="treeData"
             id="metadata-tree"
             node-key="id"
             @node-collapse="handleNodeCollapse"
             @node-expand="handleNodeExpand"
             :default-expanded-keys="expandedTreeNodes">
    </el-tree>
  </el-row>
</template>

<script>
  import {defaultMetadataType, metadataSchemas} from '../assets/metadataRegistry';
  import {get, flatMap} from 'lodash-es';
  import { safeJsonParse } from '../util'
  import {optionalSuffixInParens} from '../lib/vueFilters';

  export default {
    name: 'dataset-info',
    props: ['metadata', 'expandedKeys', 'currentUser'],
    data() {
      return {
        expandedTreeNodes: safeJsonParse(localStorage.getItem('expandedTreeNodes')) || [],
      };
    },
    created() {
      if (!this.expandedTreeNodes.length) {
        this.expandedTreeNodes = flatMap(this.treeData, this.getNonLeafNodeIds);
      }
    },

    computed: {
      dsGroup() {
        return this.metadata.Group
      },

      dsSubmitter() {
        return this.metadata.Submitter
      },

      dsProjects() {
        return this.metadata.Projects
      },

      dsPI() {
        return this.metadata.PI
      },

      schema() {
        const metadataType = get(this.metadata, 'Metadata_Type')
          || this.$store.getters.filter.metadataType
          || defaultMetadataType;
        return metadataSchemas[metadataType];
      },

      treeData() {
        let schemaBasedVals = this.objToTreeNode(null, this.metadata, this.schema);
        // The current user may be allowed by the API to see the submitter & PI's email address due to being members
        // of the same groups/projects, but we don't have any way of communicating why they're allowed to see some emails
        // and not others. This could creep users out and make them wonder if we're sharing their email address to
        // the public internet. Because of this, only show email addresses to admins here.
        const canSeeEmailAddresses = this.currentUser && this.currentUser.role === 'admin';
        const submitter = optionalSuffixInParens(this.dsSubmitter.name, canSeeEmailAddresses ? this.dsSubmitter.email : null);
        const dataManagementChilds = [
          {id: "Submitter", label: `Submitter: ${submitter}`},
        ];
        if (this.dsPI != null) {
          const pi = optionalSuffixInParens(this.dsPI.name, canSeeEmailAddresses ? this.dsPI.email : null);
          dataManagementChilds.push({id: "Principal Investigator", label: `Principal Investigator: ${pi}`});
        }
        if (this.dsGroup != null) {
          dataManagementChilds.push({id: "Group", label: `Group: ${this.dsGroup.name}`});
        }
        if (this.dsProjects != null && this.dsProjects.length > 0) {
          let allProjects = this.dsProjects.map(e => e.name).join(', ');
          dataManagementChilds.push({id: "Projects", label: `Projects: ${allProjects}`});
        }
        schemaBasedVals.push({id: "Data Management", label: "Data Management", children: dataManagementChilds});
        return schemaBasedVals;
      }
    },

    methods: {
      handleNodeCollapse(node) {
        let childs = this.getNonLeafNodeIds(node);
        for (let child of childs) {
          let nodeId = this.expandedTreeNodes.indexOf(child);
          if (nodeId !== -1) {
            this.expandedTreeNodes.splice(nodeId, 1);
          }
        }
        localStorage.setItem('expandedTreeNodes', JSON.stringify(this.expandedTreeNodes));
      },

      handleNodeExpand(node) {
        this.expandedTreeNodes.push(node.id);
        localStorage.setItem('expandedTreeNodes', JSON.stringify(this.expandedTreeNodes));
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
          return {id, label: `${label}: ${Array.isArray(obj) ? JSON.stringify(obj) : this.prettify(obj)}`};

        return {id, label, children};
      },

      getNonLeafNodeIds(node) {
        if (node.id !== null && Array.isArray(node.children) && node.children.length > 0) {
          return [node.id, ...flatMap(node.children, this.getNonLeafNodeIds)];
        } else {
          return [];
        }
      }
    }
  }
</script>

<style>
 #metadata-tree {
   text-align: left;
 }
</style>
