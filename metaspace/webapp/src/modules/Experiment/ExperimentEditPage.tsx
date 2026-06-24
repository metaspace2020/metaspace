import { defineComponent, ref, computed, watch, inject } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'
import { ElCard, ElInput, ElButton, ElMessage, ElDivider } from '../../lib/element-plus'
import {
  experimentQuery,
  createExperimentMutation,
  updateExperimentMutation,
  runExperimentPrepMutation,
  copyRoisToDatasetsMutation,
  projectCandidateDatasetsQuery,
  datasetRoisQuery,
  datasetSegmentationsQuery,
  datasetIonImagePreviewQuery,
  emptyDraft,
  draftFromExperiment,
  serializeDraft,
  regionLabel as sharedRegionLabel,
  generateRegionKey,
  paletteColor,
  REGION_PALETTE,
  ExperimentDraft,
  ExperimentDraftDataset,
  ExperimentDraftRegion,
} from './api'
import DatasetSelector, { CandidateDataset } from './components/DatasetSelector'
import DatasetMetadataCard, { RoiOption, SegmentationOption, CopyableSource } from './components/DatasetMetadataCard'
import type { BulkCopyRoisSource } from './components/BulkAssignPanel'
import RegionMappingBoard, { BoardColumn, BoardEdge } from './components/RegionMappingBoard'
import MatchModeSelector, { MatchMode } from './components/MatchModeSelector'
import RegionMappingGroups from './components/RegionMappingGroups'
import ExperimentVariablesCard from './components/ExperimentVariablesCard'
import BulkAssignPanel from './components/BulkAssignPanel'
import { resolveRenameTarget, seedNameModeGroups } from './composables/groupNaming'
import { buildSegmentationMasks } from './composables/useSegmentationMasks'
import { isRegionValid, conditionCoverageWarning, singleReplicateWarning } from './composables/useRegionValidation'
import {
  emptyVariables,
  seedVariablesFromDraft,
  mergeVariables,
  addVariableValue,
  removeVariableValue,
  assignVariableToDatasets,
  datasetSummary,
  isDatasetFullyAssigned,
  variableUsageCount,
  VARIABLE_KEYS,
} from './composables/experimentVariables'
import type { ExperimentVariables, VariableKey } from './composables/experimentVariables'
import { getDatasetDiagnosticsQuery } from '../../api/dataset'

interface IonPreviewCacheEntry {
  ionImageUrl: string | null
  opticalImageUrl: string | null
  imageWidth: number | null
  imageHeight: number | null
}

const parseAcquisitionDims = (raw: string | null | undefined): { width: number | null; height: number | null } => {
  if (!raw) return { width: null, height: null }
  try {
    const obj = JSON.parse(raw)
    const grid = obj?.acquisition_grid
    const w = typeof grid?.count_x === 'number' ? grid.count_x : null
    const h = typeof grid?.count_y === 'number' ? grid.count_y : null
    return { width: w, height: h }
  } catch {
    return { width: null, height: null }
  }
}

export default defineComponent({
  name: 'ExperimentEditPage',
  setup(_props, { expose }) {
    const route = useRoute()
    const router = useRouter()
    const projectId = (route.params.projectId as string) ?? ''
    const id = computed(() => (route.params.id as string | undefined) ?? null)
    const isEdit = computed(() => !!id.value)

    const draft = ref<ExperimentDraft>(emptyDraft())
    const hydrated = ref(false)

    // Stable, ordered palette of values for the dropdowns/bulk chips
    const variableOptions = ref<ExperimentVariables>(emptyVariables())
    watch(
      () => seedVariablesFromDraft(draft.value),
      (seed) => {
        const merged = mergeVariables(variableOptions.value, seed)
        if (VARIABLE_KEYS.some((k) => merged[k].length !== variableOptions.value[k].length)) {
          variableOptions.value = merged
        }
      },
      { immediate: true }
    )

    const { result: expResult, onResult: onExpResult } = useQuery<{ experiment: any }>(
      experimentQuery,
      () => ({ id: id.value }),
      () => ({ enabled: isEdit.value })
    )
    onExpResult((res: any) => {
      if (!hydrated.value && res?.data?.experiment) {
        draft.value = draftFromExperiment(res.data.experiment)
        hydrated.value = true
      }
    })
    watch(
      expResult,
      (val: any) => {
        if (!hydrated.value && val?.experiment) {
          draft.value = draftFromExperiment(val.experiment)
          hydrated.value = true
        }
      },
      { immediate: true }
    )

    const { result: dsResult } = useQuery<{ allDatasets: CandidateDataset[] }>(projectCandidateDatasetsQuery, () => ({
      projectId,
    }))
    const candidates = computed<CandidateDataset[]>(() => dsResult.value?.allDatasets ?? [])

    const roisByDataset = ref<Record<string, RoiOption[]>>({})
    const segmentationsByDataset = ref<Record<string, SegmentationOption[]>>({})
    const ionImageByDataset = ref<Record<string, IonPreviewCacheEntry>>({})
    const segmentationMasksByDataset = ref<Record<string, Record<string, string>>>({})
    const segmentationMasksInflight = ref<Record<string, boolean>>({})
    const apolloClient: any = inject(DefaultApolloClient)

    const fetchRegionsForDataset = async (datasetId: string): Promise<void> => {
      if (!(datasetId in roisByDataset.value)) {
        try {
          const res = await apolloClient.query({
            query: datasetRoisQuery,
            variables: { datasetId },
            fetchPolicy: 'cache-first',
          })
          roisByDataset.value = { ...roisByDataset.value, [datasetId]: (res.data?.rois ?? []) as RoiOption[] }
        } catch {
          roisByDataset.value = { ...roisByDataset.value, [datasetId]: [] }
        }
      }
      if (!(datasetId in segmentationsByDataset.value)) {
        try {
          const res = await apolloClient.query({
            query: datasetSegmentationsQuery,
            variables: { datasetId },
            fetchPolicy: 'cache-first',
          })
          segmentationsByDataset.value = {
            ...segmentationsByDataset.value,
            [datasetId]: (res.data?.segmentations ?? []) as SegmentationOption[],
          }
        } catch {
          segmentationsByDataset.value = { ...segmentationsByDataset.value, [datasetId]: [] }
        }
      }
      if (!(datasetId in ionImageByDataset.value)) {
        try {
          const res = await apolloClient.query({
            query: datasetIonImagePreviewQuery,
            variables: { datasetId },
            fetchPolicy: 'cache-first',
          })
          const dims = parseAcquisitionDims(res.data?.dataset?.acquisitionGeometry)
          ionImageByDataset.value = {
            ...ionImageByDataset.value,
            [datasetId]: {
              ionImageUrl: res.data?.dataset?.ionThumbnailUrl ?? null,
              opticalImageUrl: res.data?.dataset?.opticalImages?.[0]?.url ?? null,
              imageWidth: dims.width,
              imageHeight: dims.height,
            },
          }
        } catch {
          ionImageByDataset.value = {
            ...ionImageByDataset.value,
            [datasetId]: { ionImageUrl: null, opticalImageUrl: null, imageWidth: null, imageHeight: null },
          }
        }
      }
    }

    watch(
      () => draft.value.datasets.map((d) => d.datasetId),
      (ids) => {
        for (const id of ids) fetchRegionsForDataset(id)
      },
      { immediate: true }
    )

    const onCopyRoisFrom = async (targetDatasetId: string, sourceDatasetId: string): Promise<void> => {
      try {
        await apolloClient.mutate({
          mutation: copyRoisToDatasetsMutation,
          variables: { sourceDatasetId, targetDatasetIds: [targetDatasetId] },
        })
        // Force-refetch the target's ROI list from the server.
        const rest = Object.fromEntries(
          Object.entries(roisByDataset.value).filter(([k]) => k !== targetDatasetId)
        ) as Record<string, RoiOption[]>
        roisByDataset.value = rest
        const res = await apolloClient.query({
          query: datasetRoisQuery,
          variables: { datasetId: targetDatasetId },
          fetchPolicy: 'network-only',
        })
        const newRois: RoiOption[] = res.data?.rois ?? []
        roisByDataset.value = { ...roisByDataset.value, [targetDatasetId]: newRois }

        // Rebuild the target dataset's regions from the new ROI list,
        // preserving whatever metadata and label group the first region had.
        draft.value = {
          ...draft.value,
          datasets: draft.value.datasets.map((ds) => {
            if (ds.datasetId !== targetDatasetId) return ds
            const preserved = ds.regions[0]
            const regions: ExperimentDraftRegion[] = newRois.map((roi) => ({
              regionKey: generateRegionKey(ds.datasetId, { sourceKind: 'roi', roiId: Number(roi.id) }),
              sourceKind: 'roi',
              roiId: Number(roi.id),
              segmentationId: null,
              labelGroupName: roi.name,
              included: true,
              metadata: preserved?.metadata ?? {
                condition: '',
                biologicalReplicateId: '',
                sampleId: '',
                technicalReplicateId: null,
                batchId: null,
              },
            }))
            return { ...ds, regions }
          }),
        }

        ElMessage.success('ROIs copied successfully')
      } catch (e: any) {
        ElMessage.error(e?.message ?? 'Failed to copy ROIs')
      }
    }

    const onBulkCopyRois = async (payload: { sourceDatasetId: string; targetDatasetIds: string[] }): Promise<void> => {
      try {
        await apolloClient.mutate({
          mutation: copyRoisToDatasetsMutation,
          variables: { sourceDatasetId: payload.sourceDatasetId, targetDatasetIds: payload.targetDatasetIds },
        })
        // Drop cached ROI lists for all targets so they are force-refetched.
        roisByDataset.value = Object.fromEntries(
          Object.entries(roisByDataset.value).filter(([k]) => !payload.targetDatasetIds.includes(k))
        ) as Record<string, RoiOption[]>
        const results = await Promise.all(
          payload.targetDatasetIds.map((targetDatasetId) =>
            apolloClient.query({
              query: datasetRoisQuery,
              variables: { datasetId: targetDatasetId },
              fetchPolicy: 'network-only',
            })
          )
        )
        const newRoisByTarget = new Map<string, RoiOption[]>(
          payload.targetDatasetIds.map((id, i) => [id, (results[i].data?.rois ?? []) as RoiOption[]])
        )
        roisByDataset.value = { ...roisByDataset.value, ...Object.fromEntries(newRoisByTarget) }
        draft.value = {
          ...draft.value,
          datasets: draft.value.datasets.map((ds) => {
            const newRois = newRoisByTarget.get(ds.datasetId)
            if (!newRois) return ds
            const preserved = ds.regions[0]
            const regions: ExperimentDraftRegion[] = newRois.map((roi) => ({
              regionKey: generateRegionKey(ds.datasetId, { sourceKind: 'roi', roiId: Number(roi.id) }),
              sourceKind: 'roi',
              roiId: Number(roi.id),
              segmentationId: null,
              labelGroupName: roi.name,
              included: true,
              metadata: preserved?.metadata ?? {
                condition: '',
                biologicalReplicateId: '',
                sampleId: '',
                technicalReplicateId: null,
                batchId: null,
              },
            }))
            return { ...ds, regionSource: 'ROI', regions }
          }),
        }
        ElMessage.success(
          `ROIs copied to ${payload.targetDatasetIds.length} dataset${payload.targetDatasetIds.length !== 1 ? 's' : ''}`
        )
      } catch (e: any) {
        ElMessage.error(e?.message ?? 'Failed to copy ROIs')
      }
    }

    /**
     * Lazily build segmentation cluster overlay masks for a dataset.
     * Only runs when the dataset has at least one segmentation_cluster region (or
     * regionSource === SEGMENTATION) — segmentation NPY files are sizable so we
     * avoid fetching unconditionally.
     */
    const fetchSegmentationMasksForDataset = async (datasetId: string): Promise<void> => {
      if (segmentationMasksByDataset.value[datasetId] || segmentationMasksInflight.value[datasetId]) return
      const segs = segmentationsByDataset.value[datasetId]
      if (!segs || segs.length === 0) return
      segmentationMasksInflight.value = { ...segmentationMasksInflight.value, [datasetId]: true }
      try {
        const res = await apolloClient.query({
          query: getDatasetDiagnosticsQuery,
          variables: { id: datasetId },
          fetchPolicy: 'cache-first',
        })
        const segDiag = res.data?.dataset?.diagnostics?.find((d: any) => d.type === 'SEGMENTATION')
        const labelMapImage = segDiag?.images?.find((img: any) => img.key === 'LABEL_MAP')
        if (!labelMapImage?.url) return
        const colorBySegmentationId: Record<string, string> = {}
        segs.forEach((seg, idx) => {
          colorBySegmentationId[seg.id] = paletteColor(idx)
        })
        const masks = await buildSegmentationMasks({
          labelMapUrl: labelMapImage.url,
          segmentations: segs.map((s) => ({ id: s.id, segmentIndex: s.segmentIndex })),
          colorBySegmentationId,
        })
        segmentationMasksByDataset.value = { ...segmentationMasksByDataset.value, [datasetId]: masks }
      } catch (e) {
        // best-effort; keep the absence of masks silent so the UI stays usable
        // eslint-disable-next-line no-console
        console.warn('Failed to build segmentation masks', e)
      } finally {
        segmentationMasksInflight.value = { ...segmentationMasksInflight.value, [datasetId]: false }
      }
    }

    watch(
      () =>
        draft.value.datasets.map((d) => ({
          datasetId: d.datasetId,
          needsMasks: d.regionSource === 'SEGMENTATION',
          segCount: (segmentationsByDataset.value[d.datasetId] ?? []).length,
        })),
      (entries) => {
        for (const e of entries) {
          if (e.needsMasks && e.segCount > 0) fetchSegmentationMasksForDataset(e.datasetId)
        }
      },
      { deep: true, immediate: true }
    )

    const creating = ref(false)
    const updating = ref(false)
    const running = ref(false)
    const showMappingBoard = ref(false)

    const createMut = async (variables: any): Promise<any> => {
      creating.value = true
      try {
        return await apolloClient.mutate({
          mutation: createExperimentMutation,
          variables,
          // The newly-created Experiment is not in any cached
          // `experimentsByProject` result, so the post-redirect list view
          // would render stale without an explicit refetch.
          refetchQueries: ['experimentsByProject'],
          awaitRefetchQueries: true,
        })
      } finally {
        creating.value = false
      }
    }
    const updateMut = async (variables: any): Promise<any> => {
      updating.value = true
      try {
        return await apolloClient.mutate({
          mutation: updateExperimentMutation,
          variables,
          refetchQueries: ['experimentsByProject'],
          awaitRefetchQueries: true,
        })
      } finally {
        updating.value = false
      }
    }
    const runMut = async (variables: any): Promise<any> => {
      running.value = true
      try {
        return await apolloClient.mutate({
          mutation: runExperimentPrepMutation,
          variables,
          refetchQueries: ['experimentsByProject'],
          awaitRefetchQueries: true,
        })
      } finally {
        running.value = false
      }
    }

    const saving = computed(() => creating.value || updating.value)

    const saveBlocked = computed(() => draft.value.datasets.some((ds) => ds.regions.some((r) => !isRegionValid(r).ok)))
    const conditionWarning = computed(() => conditionCoverageWarning(draft.value.datasets.flatMap((ds) => ds.regions)))
    const replicateWarning = computed(() => singleReplicateWarning(draft.value.datasets.flatMap((ds) => ds.regions)))

    interface ContrastPreviewPair {
      condA: string
      condB: string
      nA: number
      nB: number
    }
    interface LabelGroupPreview {
      name: string
      color: string
      pairs: ContrastPreviewPair[]
    }

    const analysisPreview = computed<LabelGroupPreview[]>(() => {
      const allRegions = draft.value.datasets.flatMap((ds) => ds.regions).filter((r) => r.included !== false)
      return draft.value.labelGroups.map((lg) => {
        const lgRegions = allRegions.filter((r) => r.labelGroupName === lg.name)
        // Count distinct effective replicates per condition.
        const condMap = new Map<string, Set<string>>()
        for (const r of lgRegions) {
          const cond = r.metadata.condition?.trim()
          if (!cond) continue
          if (!condMap.has(cond)) condMap.set(cond, new Set())
          condMap.get(cond)!.add(r.metadata.biologicalReplicateId?.trim() || r.regionKey)
        }
        const conditions = Array.from(condMap.keys()).sort()
        const pairs: ContrastPreviewPair[] = []
        for (let i = 0; i < conditions.length; i++) {
          for (let j = i + 1; j < conditions.length; j++) {
            pairs.push({
              condA: conditions[i],
              condB: conditions[j],
              nA: condMap.get(conditions[i])!.size,
              nB: condMap.get(conditions[j])!.size,
            })
          }
        }
        return { name: lg.name, color: lg.color, pairs }
      })
    })

    const labelGroupOptions = computed(() => draft.value.labelGroups.map((lg) => ({ name: lg.name, color: lg.color })))

    const onDatasetsChange = (next: ExperimentDraftDataset[]): void => {
      draft.value = { ...draft.value, datasets: next }
    }

    const onCardChange = (idx: number, next: ExperimentDraftDataset): void => {
      const datasets = draft.value.datasets.map((d, i) => (i === idx ? next : d))
      draft.value = { ...draft.value, datasets }
    }

    const onCardRemove = (idx: number): void => {
      const datasets = draft.value.datasets.filter((_, i) => i !== idx)
      draft.value = { ...draft.value, datasets }
    }

    const datasetInfo = (datasetId: string): CandidateDataset => {
      const found = candidates.value.find((c) => c.id === datasetId)
      return found ?? { id: datasetId, name: datasetId, polarity: null }
    }

    /** Datasets that already have ROIs loaded — used as copy sources in the bulk panel. */
    const copyRoisSources = computed<BulkCopyRoisSource[]>(() =>
      draft.value.datasets
        .map((d) => ({
          datasetId: d.datasetId,
          name: datasetInfo(d.datasetId).name,
          roiCount: roisByDataset.value[d.datasetId]?.length ?? 0,
        }))
        .filter((s) => s.roiCount > 0)
    )

    /** Datasets in a shape the bulk-assign panel can render as selectable chips. */
    const bulkDatasets = computed(() =>
      draft.value.datasets.map((d) => ({
        id: d.datasetId,
        name: datasetInfo(d.datasetId).name,
        values: datasetSummary(d),
      }))
    )
    const assignedCount = computed(() => draft.value.datasets.filter(isDatasetFullyAssigned).length)

    /** Apply tag add/remove from the variables card. Removing a value that is in use is vetoed. */
    const onVariableChange = (payload: { key: VariableKey; values: string[] }): void => {
      const { key, values } = payload
      const current = variableOptions.value[key]
      for (const v of values) {
        if (!current.includes(v)) variableOptions.value = addVariableValue(variableOptions.value, key, v)
      }
      for (const v of current) {
        if (!values.includes(v)) {
          const used = variableUsageCount(draft.value, key, v)
          if (used > 0) {
            ElMessage.warning(`"${v}" is used by ${used} region(s) — change those first`)
          } else {
            variableOptions.value = removeVariableValue(variableOptions.value, key, v)
          }
        }
      }
    }

    /** Set a value on every region of the selected datasets. */
    const onBulkAssign = (payload: { key: VariableKey; value: string; datasetIds: string[] }): void => {
      draft.value = assignVariableToDatasets(draft.value, payload.datasetIds, payload.key, payload.value)
    }

    /** Add a brand-new value (typed in the bulk panel) to the palette without assigning it yet. */
    const onBulkAddValue = (payload: { key: VariableKey; value: string }): void => {
      variableOptions.value = addVariableValue(variableOptions.value, payload.key, payload.value)
    }

    /** Build the columns for RegionMappingBoard from the current draft. */
    const columns = computed<BoardColumn[]>(() =>
      draft.value.datasets.map((ds) => ({
        datasetId: ds.datasetId,
        name: datasetInfo(ds.datasetId).name,
        regions: ds.regions
          .filter((r) => r.included !== false)
          .map((r, idx) => {
            const lg = r.labelGroupName ? draft.value.labelGroups.find((g) => g.name === r.labelGroupName) : null
            return {
              regionKey: r.regionKey,
              label: sharedRegionLabel(
                r,
                roisByDataset.value[ds.datasetId] ?? [],
                segmentationsByDataset.value[ds.datasetId] ?? []
              ),
              color: lg?.color ?? paletteColor(idx),
            }
          }),
      }))
    )

    const edges = computed<BoardEdge[]>(() => {
      const out: BoardEdge[] = []
      for (const lg of draft.value.labelGroups) {
        const assigned: string[] = []
        for (const ds of draft.value.datasets) {
          for (const r of ds.regions) {
            if (r.labelGroupName === lg.name) assigned.push(r.regionKey)
          }
        }
        if (assigned.length < 2) continue
        for (let i = 1; i < assigned.length; i++) {
          out.push({ from: assigned[i - 1], to: assigned[i], color: lg.color })
        }
      }
      return out
    })

    /** Allocate a fresh `auto_N` group name not currently in the draft. */
    const nextAutoGroupName = (): string => {
      const used = new Set(draft.value.labelGroups.map((g) => g.name))
      let n = draft.value.labelGroups.length + 1
      while (used.has(`auto_${n}`)) n++
      return `auto_${n}`
    }

    const groupOf = (regionKey: string): string | null => {
      for (const ds of draft.value.datasets) {
        const r = ds.regions.find((x) => x.regionKey === regionKey)
        if (r?.labelGroupName) return r.labelGroupName
      }
      return null
    }

    const onAddEdge = (e: BoardEdge): void => {
      // In NAME mode, edges are derived from matching region labels — manual edits would be ignored.
      if (draft.value.matchMode === 'NAME') return
      const gFrom = groupOf(e.from)
      const gTo = groupOf(e.to)

      // Both already in same group — nothing to do.
      if (gFrom && gTo && gFrom === gTo) return

      // Merge two existing groups: keep gFrom, drop gTo.
      if (gFrom && gTo) {
        const datasets = draft.value.datasets.map((ds) => ({
          ...ds,
          regions: ds.regions.map((r) => (r.labelGroupName === gTo ? { ...r, labelGroupName: gFrom } : r)),
        }))
        const labelGroups = draft.value.labelGroups.filter((g) => g.name !== gTo)
        draft.value = { ...draft.value, labelGroups, datasets }
        return
      }

      // Extend an existing group with the other endpoint.
      if (gFrom || gTo) {
        const groupName = (gFrom ?? gTo) as string
        const newcomer = gFrom ? e.to : e.from
        const datasets = draft.value.datasets.map((ds) => ({
          ...ds,
          regions: ds.regions.map((r) => (r.regionKey === newcomer ? { ...r, labelGroupName: groupName } : r)),
        }))
        draft.value = { ...draft.value, datasets }
        return
      }

      // Neither has a group — create a fresh one.
      const groupName = nextAutoGroupName()
      const color = REGION_PALETTE[draft.value.labelGroups.length % REGION_PALETTE.length]
      const labelGroups = [...draft.value.labelGroups, { name: groupName, color }]
      const datasets = draft.value.datasets.map((ds) => ({
        ...ds,
        regions: ds.regions.map((r) =>
          r.regionKey === e.from || r.regionKey === e.to ? { ...r, labelGroupName: groupName } : r
        ),
      }))
      draft.value = { ...draft.value, labelGroups, datasets }
    }

    const detachRegionFromGroup = (regionKey: string): void => {
      const groupName = groupOf(regionKey)
      if (!groupName) return
      let datasets = draft.value.datasets.map((ds) => ({
        ...ds,
        regions: ds.regions.map((r) => (r.regionKey === regionKey ? { ...r, labelGroupName: null } : r)),
      }))
      const remaining: string[] = []
      for (const ds of datasets) {
        for (const r of ds.regions) {
          if (r.labelGroupName === groupName) remaining.push(r.regionKey)
        }
      }
      let labelGroups = draft.value.labelGroups
      // Drop the group entirely if it has fewer than 2 members left.
      if (remaining.length < 2) {
        datasets = datasets.map((ds) => ({
          ...ds,
          regions: ds.regions.map((r) => (r.labelGroupName === groupName ? { ...r, labelGroupName: null } : r)),
        }))
        labelGroups = labelGroups.filter((g) => g.name !== groupName)
      }
      draft.value = { ...draft.value, labelGroups, datasets }
    }

    const renameGroup = (payload: { oldName: string; newName: string }): void => {
      const { oldName, newName } = payload
      const trimmed = newName.trim()
      if (!trimmed || trimmed === oldName) return
      const others = draft.value.labelGroups.filter((g) => g.name !== oldName).map((g) => g.name)
      const finalName = resolveRenameTarget(trimmed, others)
      const labelGroups = draft.value.labelGroups.map((g) => (g.name === oldName ? { ...g, name: finalName } : g))
      const datasets = draft.value.datasets.map((ds) => ({
        ...ds,
        regions: ds.regions.map((r) => (r.labelGroupName === oldName ? { ...r, labelGroupName: finalName } : r)),
      }))
      draft.value = { ...draft.value, labelGroups, datasets }
    }

    const addRegionToGroup = (payload: { groupName: string; regionKey: string }): void => {
      const { groupName, regionKey } = payload
      detachRegionFromGroup(regionKey)
      const datasets = draft.value.datasets.map((ds) => ({
        ...ds,
        regions: ds.regions.map((r) => (r.regionKey === regionKey ? { ...r, labelGroupName: groupName } : r)),
      }))
      draft.value = { ...draft.value, datasets }
    }

    const deleteGroup = (payload: { name: string }): void => {
      const { name } = payload
      const labelGroups = draft.value.labelGroups.filter((g) => g.name !== name)
      const datasets = draft.value.datasets.map((ds) => ({
        ...ds,
        regions: ds.regions.map((r) => (r.labelGroupName === name ? { ...r, labelGroupName: null } : r)),
      }))
      draft.value = { ...draft.value, labelGroups, datasets }
    }

    const createGroupWithRegion = (payload: { regionKey: string }): void => {
      const groupName = nextAutoGroupName()
      const color = REGION_PALETTE[draft.value.labelGroups.length % REGION_PALETTE.length]
      const labelGroups = [...draft.value.labelGroups, { name: groupName, color }]
      const datasets = draft.value.datasets.map((ds) => ({
        ...ds,
        regions: ds.regions.map((r) => (r.regionKey === payload.regionKey ? { ...r, labelGroupName: groupName } : r)),
      }))
      draft.value = { ...draft.value, labelGroups, datasets }
    }

    const seedGroups = (): void => {
      if (draft.value.matchMode !== 'NAME') return
      const labelByKey = new Map<string, string>()
      for (const ds of draft.value.datasets) {
        const rois = roisByDataset.value[ds.datasetId] ?? []
        const segs = segmentationsByDataset.value[ds.datasetId] ?? []
        for (const r of ds.regions) {
          if (r.included === false) continue
          labelByKey.set(r.regionKey, sharedRegionLabel(r, rois, segs))
        }
      }
      const seeded = seedNameModeGroups({
        datasets: draft.value.datasets.map((ds) => ({
          datasetId: ds.datasetId,
          regions: ds.regions.filter((r) => r.included !== false),
        })),
        labelGroups: draft.value.labelGroups,
        labelOf: (r) => labelByKey.get(r.regionKey) ?? '',
        palette: [...REGION_PALETTE],
      })
      const updatedDatasets = draft.value.datasets.map((ds, idx) => {
        const seededDs = seeded.datasets[idx]
        const byKey = new Map(seededDs.regions.map((r) => [r.regionKey, r.labelGroupName]))
        return {
          ...ds,
          regions: ds.regions.map((r) =>
            byKey.has(r.regionKey) ? { ...r, labelGroupName: byKey.get(r.regionKey) ?? null } : r
          ),
        }
      })
      const sameLabelGroups =
        seeded.labelGroups.length === draft.value.labelGroups.length &&
        seeded.labelGroups.every((g, i) => {
          const cur = draft.value.labelGroups[i]
          return cur && cur.name === g.name && cur.color === g.color
        })
      const sameAssignments = updatedDatasets.every((nextDs, i) => {
        const curDs = draft.value.datasets[i]
        if (!curDs || nextDs.regions.length !== curDs.regions.length) return false
        return nextDs.regions.every((r, j) => r.labelGroupName === curDs.regions[j].labelGroupName)
      })
      if (sameLabelGroups && sameAssignments) return
      draft.value = { ...draft.value, labelGroups: seeded.labelGroups, datasets: updatedDatasets }
    }

    watch(
      () => {
        const regionsKey = draft.value.datasets.map((d) => d.regions.length).join(',')
        const labelsKey = draft.value.datasets
          .map((d) => {
            const rois = roisByDataset.value[d.datasetId]?.length ?? -1
            const segs = segmentationsByDataset.value[d.datasetId]?.length ?? -1
            return `${rois}/${segs}`
          })
          .join('|')
        return `${draft.value.matchMode}|${regionsKey}|${labelsKey}`
      },
      seedGroups,
      { flush: 'post' }
    )

    // Auto-populate draft.value.labelGroups from labelGroupName values on regions.
    // Runs whenever a new group name appears that isn't yet registered in the palette.
    watch(
      () => {
        const names: string[] = []
        for (const ds of draft.value.datasets) {
          for (const r of ds.regions) {
            if (r.labelGroupName) names.push(r.labelGroupName)
          }
        }
        return [...new Set(names)].sort().join('|')
      },
      () => {
        const usedNames = new Set<string>()
        for (const ds of draft.value.datasets) {
          for (const r of ds.regions) {
            if (r.labelGroupName) usedNames.add(r.labelGroupName)
          }
        }
        const existing = new Set(draft.value.labelGroups.map((g) => g.name))
        const toAdd = [...usedNames].filter((n) => !existing.has(n))
        if (toAdd.length === 0) return
        const newGroups = [...draft.value.labelGroups]
        for (const name of toAdd) {
          newGroups.push({ name, color: paletteColor(newGroups.length) })
        }
        draft.value = { ...draft.value, labelGroups: newGroups }
      },
      { flush: 'post' }
    )

    const noNamesMatched = computed(() => {
      if (draft.value.matchMode !== 'NAME') return false
      if (draft.value.datasets.length < 2) return false
      const allLabelsLoaded = draft.value.datasets.every(
        (d) => roisByDataset.value[d.datasetId] != null && segmentationsByDataset.value[d.datasetId] != null
      )
      if (!allLabelsLoaded) return false
      const hasIncludedRegions = draft.value.datasets.some((d) => d.regions.some((r) => r.included !== false))
      if (!hasIncludedRegions) return false
      return draft.value.labelGroups.length === 0
    })

    const onReorderRegion = (payload: { datasetId: string; regionKey: string; toIndex: number }): void => {
      const datasets = draft.value.datasets.map((ds) => {
        if (ds.datasetId !== payload.datasetId) return ds
        const fromIdx = ds.regions.findIndex((r) => r.regionKey === payload.regionKey)
        if (fromIdx < 0 || payload.toIndex < 0 || payload.toIndex > ds.regions.length) return ds
        const adjusted = fromIdx < payload.toIndex ? payload.toIndex - 1 : payload.toIndex
        if (adjusted === fromIdx) return ds
        const next = ds.regions.slice()
        const [moved] = next.splice(fromIdx, 1)
        next.splice(adjusted, 0, moved)
        return { ...ds, regions: next }
      })
      draft.value = { ...draft.value, datasets }
    }

    const onReorderColumns = (payload: { from: string; toIndex: number }): void => {
      const list = draft.value.datasets
      const fromIdx = list.findIndex((d) => d.datasetId === payload.from)
      if (fromIdx < 0 || payload.toIndex < 0 || payload.toIndex > list.length) return
      // Splice removes first, so adjust target index when moving forwards.
      const adjusted = fromIdx < payload.toIndex ? payload.toIndex - 1 : payload.toIndex
      if (adjusted === fromIdx) return
      const next = list.slice()
      const [moved] = next.splice(fromIdx, 1)
      next.splice(adjusted, 0, moved)
      draft.value = { ...draft.value, datasets: next }
    }

    const onMatchModeChange = (mode: MatchMode): void => {
      draft.value = { ...draft.value, matchMode: mode }
    }

    const onSave = async (): Promise<void> => {
      try {
        if (isEdit.value && id.value) {
          await updateMut({ id: id.value, input: serializeDraft(draft.value) })
        } else {
          await createMut({ projectId, input: serializeDraft(draft.value) })
        }
        ElMessage.success('Saved')
        router.push({ path: `/project/${projectId}`, query: { tab: 'experiments' } })
      } catch (e: any) {
        ElMessage.error(e?.message ?? 'Save failed')
      }
    }

    const onRun = async (): Promise<void> => {
      try {
        let runId = id.value
        if (!runId) {
          const res: any = await createMut({ projectId, input: serializeDraft(draft.value) })
          runId = res?.data?.createExperiment?.id ?? null
        } else {
          await updateMut({ id: runId, input: serializeDraft(draft.value) })
        }
        if (!runId) throw new Error('Could not determine experiment id after save')
        await runMut({ id: runId })
        ElMessage.success('Experiment submitted')
        router.push({ path: `/project/${projectId}`, query: { tab: 'experiments' } })
      } catch (e: any) {
        ElMessage.error(e?.message ?? 'Run failed')
      }
    }

    expose({
      draft,
      setDraft: (d: ExperimentDraft) => {
        draft.value = d
      },
      variableOptions,
      onVariableChange,
      onBulkAssign,
      onBulkAddValue,
      onAddEdge,
      detachRegionFromGroup,
      renameGroup,
      addRegionToGroup,
      createGroupWithRegion,
      deleteGroup,
      onReorderColumns,
    })

    return () => {
      return (
        <div class="flex items-center justify-center">
          <div class="m-8 w-full max-w-5xl">
            <h1 class="text-2xl mb-4" data-test-key="experiment-edit-title">
              {isEdit.value ? 'Edit experiment' : 'Create experiment'}
            </h1>

            <ElCard class="mb-6" shadow="never">
              <div class="space-y-4">
                <div>
                  <label class="block text-sm mb-1">Name</label>
                  <ElInput
                    modelValue={draft.value.name}
                    placeholder="Experiment name"
                    data-test-key="experiment-name"
                    onUpdate:modelValue={(v: string) => {
                      draft.value = { ...draft.value, name: v }
                    }}
                  />
                </div>
                <div>
                  <label class="block text-sm mb-1">Description</label>
                  <ElInput
                    type="textarea"
                    rows={2}
                    modelValue={draft.value.description ?? ''}
                    placeholder="Optional description"
                    data-test-key="experiment-description"
                    onUpdate:modelValue={(v: string) => {
                      draft.value = { ...draft.value, description: v || null }
                    }}
                  />
                </div>
              </div>
            </ElCard>

            <ElCard class="mb-6" shadow="never">
              <h2 class="text-lg mb-2">Datasets</h2>
              <DatasetSelector
                candidates={candidates.value}
                modelValue={draft.value.datasets}
                onUpdate:modelValue={onDatasetsChange}
              />
            </ElCard>

            <ExperimentVariablesCard modelValue={variableOptions.value} onChange-variable={onVariableChange} />

            {draft.value.datasets.length > 0 && (
              <BulkAssignPanel
                datasets={bulkDatasets.value}
                variables={variableOptions.value}
                assignedCount={assignedCount.value}
                copyRoisSources={copyRoisSources.value}
                onAssign={onBulkAssign}
                onAdd-value={onBulkAddValue}
                onCopy-rois={onBulkCopyRois}
              />
            )}

            {draft.value.datasets.map((d, idx) => {
              const preview = ionImageByDataset.value[d.datasetId] ?? {
                ionImageUrl: null,
                opticalImageUrl: null,
                imageWidth: null,
                imageHeight: null,
              }
              const copyableSources: CopyableSource[] = draft.value.datasets
                .filter((other) => other.datasetId !== d.datasetId)
                .map((other) => ({
                  datasetId: other.datasetId,
                  name: datasetInfo(other.datasetId).name,
                  roiCount: roisByDataset.value[other.datasetId]?.length ?? 0,
                }))
                .filter((s) => s.roiCount > 0)
              return (
                <DatasetMetadataCard
                  key={d.datasetId}
                  dataset={datasetInfo(d.datasetId)}
                  modelValue={d}
                  variables={variableOptions.value}
                  rois={roisByDataset.value[d.datasetId] ?? []}
                  segmentations={segmentationsByDataset.value[d.datasetId] ?? []}
                  labelGroups={labelGroupOptions.value}
                  ionImageUrl={preview.ionImageUrl}
                  opticalImageUrl={preview.opticalImageUrl}
                  imageWidth={preview.imageWidth}
                  imageHeight={preview.imageHeight}
                  segmentationMasks={segmentationMasksByDataset.value[d.datasetId] ?? {}}
                  copyableSources={copyableSources}
                  onUpdate:modelValue={(v: ExperimentDraftDataset) => onCardChange(idx, v)}
                  onRemove={() => onCardRemove(idx)}
                  onCopyRoisFrom={(sourceId: string) => onCopyRoisFrom(d.datasetId, sourceId)}
                />
              )
            })}

            <ElDivider />

            {conditionWarning.value && draft.value?.datasets?.length > 0 && (
              <div
                class="bg-yellow-50 border border-yellow-300 rounded p-2 text-sm mb-4"
                data-test-key="one-condition-warning"
              >
                {conditionWarning.value.conditions.length === 0 ? (
                  <div>No condition values are set; a statistical test cannot be inferred.</div>
                ) : (
                  <div>
                    Only one condition (<strong>{conditionWarning.value.conditions.join(', ')}</strong>) is present
                    across the experiment; a statistical test needs at least two conditions to compare.
                  </div>
                )}
              </div>
            )}
            {replicateWarning.value && draft.value?.datasets?.length > 0 && (
              <div
                class="bg-yellow-50 border border-yellow-300 rounded p-2 text-sm mb-4"
                data-test-key="single-replicate-warning"
              >
                {replicateWarning.value.missingBioReps ? (
                  <div>
                    No biological replicate IDs are set — each region will be treated as an independent replicate.
                    Results will not be statistically meaningful without true biological replicates.
                  </div>
                ) : (
                  <div>
                    <div class="mb-1">
                      The following conditions have only one biological replicate — statistical results will not be
                      meaningful:
                    </div>
                    <ul class="pl-4 mb-0">
                      {replicateWarning.value.affected.map((a, i) => (
                        <li key={i}>
                          <strong>{a.condition}</strong>
                          {a.labelGroup !== '__none__' ? ` (label group: ${a.labelGroup})` : ''} — {a.n} replicate
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <ElCard class="mb-6" shadow="never">
              <h2 class="text-lg mb-2">Region mapping</h2>
              <MatchModeSelector modelValue={draft.value.matchMode} onUpdate:modelValue={onMatchModeChange} />
              <div class="my-3" />
              {draft.value.matchMode === 'MANUAL' && (
                <>
                  <div class="flex justify-end mb-2">
                    <button
                      class="text-sm text-blue-600 hover:underline cursor-pointer"
                      style={{ background: 'transparent', border: 'none', padding: 0 }}
                      onClick={() => (showMappingBoard.value = !showMappingBoard.value)}
                    >
                      {showMappingBoard.value ? 'Hide mapping board' : 'Show mapping board'}
                    </button>
                  </div>
                  {showMappingBoard.value && (
                    <RegionMappingBoard
                      data-test-key="mapping-board"
                      columns={columns.value}
                      edges={edges.value}
                      onAdd-edge={onAddEdge}
                      onRemove-edge={(e: BoardEdge) => detachRegionFromGroup(e.to)}
                      onReorder={onReorderColumns}
                      onReorder-region={onReorderRegion}
                    />
                  )}
                  <div class="flex flex-col justify-center items-center bg-black/[.02] p-2 mt-4">
                    <div class="text-sm mb-2">Generated mappings</div>
                    <RegionMappingGroups
                      data-test-key="region-mapping-groups-manual"
                      datasets={draft.value.datasets.map((ds) => ({
                        datasetId: ds.datasetId,
                        name: datasetInfo(ds.datasetId).name,
                        regions: ds.regions
                          .filter((r) => r.included !== false)
                          .map((r) => ({
                            regionKey: r.regionKey,
                            label: sharedRegionLabel(
                              r,
                              roisByDataset.value[ds.datasetId] ?? [],
                              segmentationsByDataset.value[ds.datasetId] ?? []
                            ),
                            labelGroupName: r.labelGroupName ?? null,
                          })),
                      }))}
                      labelGroups={draft.value.labelGroups}
                      onRename-group={renameGroup}
                      onAdd-region-to-group={addRegionToGroup}
                      onRemove-region-from-group={(p: { regionKey: string }) => detachRegionFromGroup(p.regionKey)}
                      onCreate-group-with-region={createGroupWithRegion}
                      onDelete-group={deleteGroup}
                    />
                  </div>
                </>
              )}
              {draft.value.matchMode === 'NAME' && noNamesMatched.value && (
                <div
                  class="bg-yellow-50 border border-yellow-300 rounded p-2 text-sm mb-3"
                  data-test-key="no-names-matched"
                >
                  No names matched across datasets. Switch to "Manual mapping" to link regions explicitly.
                </div>
              )}
              {draft.value.matchMode === 'NAME' && (
                <RegionMappingGroups
                  data-test-key="region-mapping-groups"
                  allowAdd={false}
                  datasets={draft.value.datasets.map((ds) => ({
                    datasetId: ds.datasetId,
                    name: datasetInfo(ds.datasetId).name,
                    regions: ds.regions
                      .filter((r) => r.included !== false)
                      .map((r) => ({
                        regionKey: r.regionKey,
                        label: sharedRegionLabel(
                          r,
                          roisByDataset.value[ds.datasetId] ?? [],
                          segmentationsByDataset.value[ds.datasetId] ?? []
                        ),
                        labelGroupName: r.labelGroupName ?? null,
                      })),
                  }))}
                  labelGroups={draft.value.labelGroups}
                  onRename-group={renameGroup}
                  onAdd-region-to-group={addRegionToGroup}
                  onRemove-region-from-group={(p: { regionKey: string }) => detachRegionFromGroup(p.regionKey)}
                  onCreate-group-with-region={createGroupWithRegion}
                  onDelete-group={deleteGroup}
                />
              )}
            </ElCard>

            {analysisPreview.value.length > 0 && (
              <div class="mb-6" data-test-key="analysis-preview">
                <h3 class="text-base font-medium mb-2">Analysis preview</h3>
                {analysisPreview.value.map((lg) => (
                  <div key={lg.name} class="mb-3">
                    <div class="flex items-center gap-2 mb-1">
                      <span class="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ background: lg.color }} />
                      <span class="text-sm font-medium">{lg.name}</span>
                    </div>
                    {lg.pairs.length === 0 ? (
                      <p class="text-sm text-gray-400 ml-5">Needs ≥ 2 conditions to run a comparison.</p>
                    ) : (
                      <ul class="list-none ml-5 mb-0">
                        {lg.pairs.map((p, i) => (
                          <li key={i} class="text-sm text-gray-700">
                            <span class="font-medium">{p.condA}</span>
                            <span class="text-gray-400 mx-1">({p.nA})</span>
                            <span class="text-gray-500 mx-1">vs</span>
                            <span class="font-medium">{p.condB}</span>
                            <span class="text-gray-400 mx-1">({p.nB})</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
                {analysisPreview.value.every((lg) => lg.pairs.length === 0) && (
                  <p class="text-sm text-gray-400 mt-1" data-test-key="analysis-preview-fallback">
                    No label group has ≥ 2 conditions — all regions will be analysed together if the experiment-wide
                    pool has ≥ 2 conditions.
                  </p>
                )}
              </div>
            )}

            <div class="flex gap-2 justify-end">
              <ElButton onClick={() => router.push(`/project/${projectId}`)}>Cancel</ElButton>
              <ElButton
                type="primary"
                data-test-key="experiment-save"
                loading={saving.value}
                disabled={saveBlocked.value}
                onClick={onSave}
              >
                Save
              </ElButton>
              <ElButton
                type="success"
                data-test-key="experiment-run"
                loading={running.value || saving.value}
                disabled={draft.value.datasets.length === 0}
                onClick={onRun}
              >
                Save and run
              </ElButton>
            </div>
          </div>
        </div>
      )
    }
  },
})
