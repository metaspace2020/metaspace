import { defineComponent, ref, computed, watch, inject } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'
import { ElCard, ElInput, ElButton, ElMessage, ElDivider, ElSkeleton, ElTooltip } from '../../lib/element-plus'
import {
  experimentQuery,
  createExperimentMutation,
  updateExperimentMutation,
  runExperimentPrepMutation,
  copyRoisToDatasetsMutation,
  projectCandidateDatasetsQuery,
  experimentProjectRoleQuery,
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
import DatasetMetadataCard, { RoiOption, SegmentationOption } from './components/DatasetMetadataCard'
import type { BulkCopyRoisSource } from './components/BulkAssignPanel'
import MatchModeSelector, { MatchMode } from './components/MatchModeSelector'
import RegionMappingGroups from './components/RegionMappingGroups'
import ExperimentVariablesCard from './components/ExperimentVariablesCard'
import BulkAssignPanel from './components/BulkAssignPanel'
import { useExperimentPermissions, promptExperimentProUpgrade } from './composables/experimentPermissions'
import { ProjectRoleOptions } from '../../api/project'
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
import { InfoFilled } from '@element-plus/icons-vue'

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

    const {
      result: expResult,
      loading: expLoading,
      onResult: onExpResult,
    } = useQuery<{ experiment: any }>(
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

    // Creating an experiment requires admin, or a project member/manager with an active
    // Pro subscription. Editing an existing one is unaffected by this gate.
    const { result: projectRoleResult } = useQuery<{ project: { currentUserRole: string | null } | null }>(
      experimentProjectRoleQuery,
      () => ({ projectId }),
      () => ({ enabled: !!projectId })
    )
    const canEditProject = computed(() => {
      const role = projectRoleResult.value?.project?.currentUserRole
      return role === ProjectRoleOptions.MANAGER || role === ProjectRoleOptions.MEMBER
    })
    const { canCreateExperiment } = useExperimentPermissions()
    const canCreate = canCreateExperiment(canEditProject)

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
    const loading = computed(() => isEdit.value && !hydrated.value && expLoading.value)

    // Creating is Pro-gated; editing an existing experiment stays allowed. Rather than
    // disabling the buttons, non-Pro editors are prompted to upgrade on click.
    const createBlocked = computed(() => !isEdit.value && !canCreate.value)
    const saveBlocked = computed(() => draft.value.datasets.some((ds) => ds.regions.some((r) => !isRegionValid(r).ok)))
    const conditionWarning = computed(() => conditionCoverageWarning(draft.value.datasets.flatMap((ds) => ds.regions)))
    const replicateWarning = computed(() => singleReplicateWarning(draft.value.datasets.flatMap((ds) => ds.regions)))
    const replicateDetailContent = () => {
      const rw = replicateWarning.value
      if (!rw) return null
      return (
        <div class="max-w-xs">
          {rw.missingBioReps ? (
            <div>
              Assign biological replicate IDs so regions from the same biological sample are grouped; true replication
              is required for meaningful statistics.
            </div>
          ) : (
            <ul class="pl-4 my-0">
              {rw.affected.map((a, i) => (
                <li key={i}>
                  <strong>{a.condition}</strong>
                  {a.labelGroup !== '__none__' ? ` (label group: ${a.labelGroup})` : ''} — {a.n} replicate
                </li>
              ))}
            </ul>
          )}
        </div>
      )
    }

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
      const usedNames = new Set(allRegions.map((r) => r.labelGroupName))
      return draft.value.labelGroups
        .filter((lg) => usedNames.has(lg.name))
        .map((lg) => {
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

    const onMatchModeChange = (mode: MatchMode): void => {
      draft.value = { ...draft.value, matchMode: mode }
    }

    const onSave = async (): Promise<void> => {
      if (createBlocked.value) {
        promptExperimentProUpgrade()
        return
      }
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
      if (createBlocked.value) {
        promptExperimentProUpgrade()
        return
      }
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
      detachRegionFromGroup,
      renameGroup,
      addRegionToGroup,
      createGroupWithRegion,
      deleteGroup,
    })

    return () => {
      return (
        <div class="flex items-center justify-center">
          <div class="m-8 w-full max-w-5xl">
            <h1 class="text-2xl mb-4" data-test-key="experiment-edit-title">
              {isEdit.value ? 'Edit experiment' : 'Create experiment'}
            </h1>

            {loading.value ? (
              <div data-test-key="experiment-edit-skeleton">
                <ElCard class="mb-6" shadow="never">
                  <ElSkeleton animated rows={3} />
                </ElCard>
                <ElCard class="mb-6" shadow="never">
                  <ElSkeleton animated rows={2} />
                </ElCard>
                <ElCard class="mb-4" shadow="never">
                  <ElSkeleton animated rows={5} />
                </ElCard>
              </div>
            ) : (
              <>
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
                  return (
                    <DatasetMetadataCard
                      key={d.datasetId}
                      initialCollapsed={idx !== 0}
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
                      onUpdate:modelValue={(v: ExperimentDraftDataset) => onCardChange(idx, v)}
                      onRemove={() => onCardRemove(idx)}
                    />
                  )
                })}

                <ElDivider />

                {conditionWarning.value && draft.value?.datasets?.length > 0 && (
                  <div
                    class="bg-yellow-50 border border-yellow-300 rounded px-2 py-1 text-sm mb-4 flex items-center gap-1"
                    data-test-key="one-condition-warning"
                  >
                    {conditionWarning.value.conditions.length === 0 ? (
                      <span>No condition values are set; a statistical test cannot be inferred.</span>
                    ) : (
                      <span>
                        Only one condition (<strong>{conditionWarning.value.conditions.join(', ')}</strong>) present — a
                        test needs ≥ 2 conditions.
                      </span>
                    )}
                    <ElTooltip placement="top">
                      {{
                        content: () => (
                          <div class="max-w-xs">
                            A statistical comparison needs at least two distinct condition values across the included
                            regions. Add a second condition, or the experiment will run without a comparison.
                          </div>
                        ),
                        default: () => (
                          <InfoFilled
                            class="w-4 h-4 text-yellow-600 cursor-help flex-shrink-0"
                            data-test-key="one-condition-warning-info"
                          />
                        ),
                      }}
                    </ElTooltip>
                  </div>
                )}
                {replicateWarning.value && draft.value?.datasets?.length > 0 && (
                  <div
                    class="bg-yellow-50 border border-yellow-300 rounded px-2 py-1 text-sm mb-4 flex items-center gap-1"
                    data-test-key="single-replicate-warning"
                  >
                    <InfoFilled
                      class="w-4 h-4 text-yellow-600 cursor-help flex-shrink-0"
                      data-test-key="single-replicate-warning-info"
                    />

                    {replicateWarning.value.missingBioReps ? (
                      <span>
                        No biological replicate IDs are set — each region is treated as its own replicate; results won't
                        be statistically meaningful.
                      </span>
                    ) : (
                      <span>
                        <ElTooltip placement="top">
                          {{
                            content: replicateDetailContent,
                            default: () => (
                              <span
                                class="text-blue-600 hover:text-blue-700 underline cursor-pointer font-medium"
                                data-test-key="single-replicate-warning-count"
                              >
                                {replicateWarning.value!.affected.length}
                              </span>
                            ),
                          }}
                        </ElTooltip>{' '}
                        condition{replicateWarning.value.affected.length !== 1 ? 's have' : ' has'} only one biological
                        replicate — results won't be statistically meaningful.
                      </span>
                    )}
                  </div>
                )}

                <ElCard class="mb-6" shadow="never">
                  <h2 class="text-lg mb-2">Region mapping</h2>
                  <MatchModeSelector modelValue={draft.value.matchMode} onUpdate:modelValue={onMatchModeChange} />
                  <div class="my-3" />
                  {draft.value.matchMode === 'MANUAL' && (
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
                    {analysisPreview.value.every((lg) => lg.pairs.length === 0) && (
                      <p
                        class="ml-3 text-xs font-semibold text-black-600 mt-2"
                        data-test-key="analysis-preview-fallback"
                      >
                        No label group has ≥ 2 conditions — all regions will be analysed together if the experiment-wide
                        pool has ≥ 2 conditions.
                      </p>
                    )}
                    <div class="flex flex-wrap gap-2">
                      {analysisPreview.value.map((lg) => (
                        <div
                          key={lg.name}
                          class="inline-flex items-center gap-1.5 border border-gray-200 rounded-full
                          px-2.5 py-1 text-xs bg-white"
                          data-test-key={`analysis-chip-${lg.name}`}
                        >
                          <span
                            class="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ background: lg.color }}
                          />
                          <span class="font-medium text-gray-700">{lg.name}</span>
                          <span class="text-gray-300">·</span>
                          {lg.pairs.length === 0 ? (
                            <span class="text-gray-400">no comparison</span>
                          ) : lg.pairs.length === 1 ? (
                            <span class="text-gray-600">
                              {lg.pairs[0].condA} vs {lg.pairs[0].condB} ({lg.pairs[0].nA}×{lg.pairs[0].nB})
                            </span>
                          ) : (
                            <span class="text-gray-600">{lg.pairs.length} comparisons</span>
                          )}
                        </div>
                      ))}
                    </div>
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
              </>
            )}
          </div>
        </div>
      )
    }
  },
})
