<template>
  <el-row>
    <el-tree
      id="metadata-tree"
      :data="treeData"
      node-key="id"
      :default-expanded-keys="expandedTreeNodes"
      @node-collapse="handleNodeCollapse"
      @node-expand="handleNodeExpand"
    />
  </el-row>
</template>

<script>
import Vue from 'vue'
import { defaultMetadataType, metadataSchemas } from '../lib/metadataRegistry'
import { get, flatMap } from 'lodash-es'
import { optionalSuffixInParens } from '../lib/vueFilters'
import { getLocalStorage, setLocalStorage } from '../lib/localStorage'

export default Vue.extend({
  name: 'DatasetInfo',
  props: ['metadata', 'expandedKeys', 'currentUser', 'additionalSettings'],
  data() {
    return {
      expandedTreeNodes: getLocalStorage('expandedTreeNodes') || [],
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
          || defaultMetadataType
      return metadataSchemas[metadataType]
    },

    treeData() {
      const metadata = this.metadata
      const {
        image_generation: imageGeneration,
      } = (this.additionalSettings || {})

      delete metadata.Additional_Information
      const schemaBasedVals = this.objToTreeNode(null, metadata, this.schema)
      // The current user may be allowed by the API to see the submitter & PI's email address due to being members
      // of the same groups/projects, but we don't have any way of communicating why they're allowed to see some emails
      // and not others. This could creep users out and make them wonder if we're sharing their email address to
      // the public internet. Because of this, only show email addresses to admins here.
      const canSeeEmailAddresses = this.currentUser && this.currentUser.role === 'admin'
      const submitter = optionalSuffixInParens(this.dsSubmitter.name,
        canSeeEmailAddresses ? this.dsSubmitter.email : null)
      const dataManagementChilds = [
        { id: 'Submitter', label: `Submitter: ${submitter}` },
      ]
      const annotationSettingsChildren = [
        { id: 'PPM', label: `m/z tolerance (ppm): ${imageGeneration?.ppm}` },
      ]

      if (this.dsPI != null) {
        const pi = optionalSuffixInParens(this.dsPI.name, canSeeEmailAddresses ? this.dsPI.email : null)
        dataManagementChilds.push({ id: 'Principal Investigator', label: `Principal Investigator: ${pi}` })
      }
      if (this.dsGroup != null) {
        dataManagementChilds.push({ id: 'Group', label: `Group: ${this.dsGroup.name}` })
      }
      if (this.dsProjects != null && this.dsProjects.length > 0) {
        const allProjects = this.dsProjects.map(e => e.name).join(', ')
        dataManagementChilds.push({ id: 'Projects', label: `Projects: ${allProjects}` })
      }
      schemaBasedVals.push({ id: 'Data Management', label: 'Data Management', children: dataManagementChilds })
      schemaBasedVals.push({
        id: 'Annotation settings',
        label: 'Annotation settings',
        children: annotationSettingsChildren,
      })
      return schemaBasedVals
    },
  },
  created() {
    if (!this.expandedTreeNodes.length) {
      this.expandedTreeNodes = flatMap(this.treeData, this.getNonLeafNodeIds)
    }
  },

  methods: {
    handleNodeCollapse(node) {
      const childs = this.getNonLeafNodeIds(node)
      for (const child of childs) {
        const nodeId = this.expandedTreeNodes.indexOf(child)
        if (nodeId !== -1) {
          this.expandedTreeNodes.splice(nodeId, 1)
        }
      }
      setLocalStorage('expandedTreeNodes', this.expandedTreeNodes)
    },

    getAnalysisVersion(analysisVersion) {
      switch (analysisVersion) {
        case 3:
          return 'v2.20230517 (METASPACE-ML)'
        case 2:
          return 'v1.5 (Prototype for higher RPs)'
        default:
          return 'v1 (Original MSM)'
      }
    },

    handleNodeExpand(node) {
      this.expandedTreeNodes.push(node.id)
      setLocalStorage('expandedTreeNodes', this.expandedTreeNodes)
    },

    prettify(str) {
      return str.toString()
        .replace(/_/g, ' ')
        .replace(/ [A-Z][a-z]/g, (x) => ' ' + x.slice(1).toLowerCase())
        .replace(/ freetext$/, '')
        .replace(/ table$/, '')
        .replace('metaspace', 'METASPACE')
    },

    objToTreeNode(label, obj, schema) {
      const children = []
      let isLeaf = true
      for (const key in schema.properties) {
        const data = obj[key]
        isLeaf = false
        const childSchema = schema.properties[key]
        if (!data || key === 'Email') {
          continue // hide e-mails from the interface
        }
        const child = this.objToTreeNode(key, data, childSchema)
        if (child.children && child.children.length === 0) {
          continue
        }
        children.push(child)
      }

      if (label === null) {
        return children
      }

      label = this.prettify(label)
      const id = label
      if (isLeaf) {
        return { id, label: `${label}: ${Array.isArray(obj) ? JSON.stringify(obj) : this.prettify(obj)}` }
      }

      return { id, label, children }
    },

    getNonLeafNodeIds(node) {
      if (node.id !== null && Array.isArray(node.children) && node.children.length > 0) {
        return [node.id, ...flatMap(node.children, this.getNonLeafNodeIds)]
      } else {
        return []
      }
    },
  },
})
</script>

<style lang="scss" scoped>
 #metadata-tree {
   text-align: left;

   // Allow line breaks & word wrap on very long lines
   /deep/ .el-tree-node {
     white-space: normal;
   }
   /deep/ .el-tree-node__content {
     height: auto;
     padding: 1px 0;
   }
   /deep/ .el-tree-node__label {
     width: calc(100% - 30px); // Flex-shrink doesn't seem to work with overflow-wrap, so subtract 30px as an approximation of the space consumed the parent's padding
     overflow-wrap: break-word;
   }
 }

</style>
