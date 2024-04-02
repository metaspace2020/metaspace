<template>
  <el-row class="w-full">
    <el-tree
      id="metadata-tree"
      class="w-full"
      :data="treeData"
      node-key="id"
      :default-expanded-keys="expandedTreeNodes"
      @node-collapse="handleNodeCollapse"
      @node-expand="handleNodeExpand"
    />
  </el-row>
</template>

<script>
import { defineComponent, ref, computed, onMounted } from 'vue'
import { useStore } from 'vuex'
import { ElTree, ElRow } from '../lib/element-plus'
import { defaultMetadataType, metadataSchemas } from '../lib/metadataRegistry'
import { get, flatMap } from 'lodash-es'
import { optionalSuffixInParens } from '../lib/vueFilters'
import { getLocalStorage, setLocalStorage } from '../lib/localStorage'

export default defineComponent({
  name: 'DatasetInfo',
  components: {
    ElTree,
    ElRow,
  },
  props: ['metadata', 'expandedKeys', 'currentUser', 'additionalSettings'],
  setup(props) {
    const store = useStore()
    const expandedTreeNodes = ref(getLocalStorage('expandedTreeNodes') || [])

    const handleNodeCollapse = (node) => {
      const childs = getNonLeafNodeIds(node)
      for (const child of childs) {
        const nodeId = expandedTreeNodes.value.indexOf(child)
        if (nodeId !== -1) {
          expandedTreeNodes.value.splice(nodeId, 1)
        }
      }
      setLocalStorage('expandedTreeNodes', expandedTreeNodes.value)
    }

    const handleNodeExpand = (node) => {
      expandedTreeNodes.value.push(node.id)
      setLocalStorage('expandedTreeNodes', expandedTreeNodes.value)
    }

    const prettify = (str) => {
      return str
        .toString()
        .replace(/_/g, ' ')
        .replace(/ [A-Z][a-z]/g, (x) => ' ' + x.slice(1).toLowerCase())
        .replace(/ freetext$/, '')
        .replace(/ table$/, '')
        .replace('metaspace', 'METASPACE')
    }

    const objToTreeNode = (label, obj, schema) => {
      const children = []
      let isLeaf = true
      for (const key in schema.properties) {
        const data = obj[key]
        isLeaf = false
        const childSchema = schema.properties[key]
        if (!data || key === 'Email') {
          continue // hide e-mails from the interface
        }
        const child = objToTreeNode(key, data, childSchema)
        if (child.children && child.children.length === 0) {
          continue
        }
        children.push(child)
      }

      if (label === null) {
        return children
      }

      label = prettify(label)
      const id = label
      if (isLeaf) {
        return { id, label: `${label}: ${Array.isArray(obj) ? JSON.stringify(obj) : prettify(obj)}` }
      }

      return { id, label, children }
    }

    const getNonLeafNodeIds = (node) => {
      if (node.id !== null && Array.isArray(node.children) && node.children.length > 0) {
        return [node.id, ...flatMap(node.children, getNonLeafNodeIds)]
      } else {
        return []
      }
    }

    const dsGroup = computed(() => props.metadata.Group)
    const dsSubmitter = computed(() => props.metadata.Submitter)
    const dsProjects = computed(() => props.metadata.Projects)
    const dsPI = computed(() => props.metadata.PI)

    const schema = computed(() => {
      const metadataType =
        get(props.metadata, 'Metadata_Type') || store.getters.filter.metadataType || defaultMetadataType

      return metadataSchemas[metadataType]
    })

    const treeData = computed(() => {
      const metadata = props.metadata
      const { image_generation: imageGeneration, fdr: fdrSettings } = props.additionalSettings || {}
      // eslint-disable-next-line camelcase
      const scoringModel = fdrSettings?.scoring_model ? 'METASPACE-ML' : 'Original MSM'

      delete metadata.Additional_Information
      const schemaBasedVals = objToTreeNode(null, metadata, schema.value)
      // The current user may be allowed by the API to see the submitter & PI's email address due to being members
      // of the same groups/projects, but we don't have any way of communicating why they're allowed to see some emails
      // and not others. This could creep users out and make them wonder if we're sharing their email address to
      // the public internet. Because of this, only show email addresses to admins here.
      const canSeeEmailAddresses = props.currentUser && props.currentUser.role === 'admin'
      const submitter = optionalSuffixInParens(
        dsSubmitter.value?.name,
        canSeeEmailAddresses ? dsSubmitter.value?.email : null
      )
      const dataManagementChilds = [{ id: 'Submitter', label: `Submitter: ${submitter}` }]
      const annotationSettingsChildren = [
        { id: 'PPM', label: `m/z tolerance (ppm): ${imageGeneration?.ppm}` },
        { id: 'engineV', label: `Analysis version: ${scoringModel}` },
      ]

      if (dsPI.value != null) {
        const pi = optionalSuffixInParens(dsPI.value.name, canSeeEmailAddresses ? dsPI.value.email : null)
        dataManagementChilds.push({ id: 'Principal Investigator', label: `Principal Investigator: ${pi}` })
      }
      if (dsGroup.value != null) {
        dataManagementChilds.push({ id: 'Group', label: `Group: ${dsGroup.value.name}` })
      }
      if (dsProjects.value != null && dsProjects.value.length > 0) {
        const allProjects = dsProjects.value.map((e) => e.name).join(', ')
        dataManagementChilds.push({ id: 'Projects', label: `Projects: ${allProjects}` })
      }
      schemaBasedVals.push({ id: 'Data Management', label: 'Data Management', children: dataManagementChilds })
      schemaBasedVals.push({
        id: 'Annotation settings',
        label: 'Annotation settings',
        children: annotationSettingsChildren,
      })
      return schemaBasedVals
    })

    onMounted(() => {
      if (!expandedTreeNodes.value.length) {
        expandedTreeNodes.value = flatMap(treeData.value, getNonLeafNodeIds)
      }
    })

    return {
      expandedTreeNodes,
      dsGroup,
      dsSubmitter,
      dsProjects,
      dsPI,
      schema,
      treeData,
      handleNodeCollapse,
      handleNodeExpand,
    }
  },
})
</script>

<style lang="scss" scoped>
#metadata-tree {
  text-align: left;

  ::v-deep(.el-tree-node) {
    white-space: normal;
  }
  ::v-deep(.el-tree-node__content) {
    height: auto;
    padding: 1px 0;
  }
  ::v-deep(.el-tree-node__label) {
    width: calc(100% - 30px);
    overflow-wrap: break-word;
  }
}
</style>
