import { defineComponent, ref, computed, watch, inject } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'
import { ElCard, ElInput, ElButton, ElMessage, ElDivider } from '../../lib/element-plus'
import {
  experimentQuery,
  createExperimentMutation,
  updateExperimentMutation,
  runExperimentMutation,
  projectCandidateDatasetsQuery,
  datasetRoisQuery,
  datasetSegmentationsQuery,
  datasetIonImagePreviewQuery,
  emptyDraft,
  draftFromExperiment,
  serializeDraft,
  regionLabel as sharedRegionLabel,
  paletteColor,
  REGION_PALETTE,
  ExperimentDraft,
  ExperimentDraftDataset,
} from './api'
import DatasetSelector, { CandidateDataset } from './components/DatasetSelector'
import DatasetMetadataCard, { RoiOption, SegmentationOption } from './components/DatasetMetadataCard'
import RegionMappingBoard, { BoardColumn, BoardEdge } from './components/RegionMappingBoard'
import MatchModeSelector, { MappingChip, MatchMode } from './components/MatchModeSelector'
import { buildSegmentationMasks } from './composables/useSegmentationMasks'
import { isRegionValid, oneConditionGroupWarnings } from './composables/useRegionValidation'
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
        return await apolloClient.mutate({ mutation: createExperimentMutation, variables })
      } finally {
        creating.value = false
      }
    }
    const updateMut = async (variables: any): Promise<any> => {
      updating.value = true
      try {
        return await apolloClient.mutate({ mutation: updateExperimentMutation, variables })
      } finally {
        updating.value = false
      }
    }
    const runMut = async (variables: any): Promise<any> => {
      running.value = true
      try {
        return await apolloClient.mutate({ mutation: runExperimentMutation, variables })
      } finally {
        running.value = false
      }
    }

    const saving = computed(() => creating.value || updating.value)

    const saveBlocked = computed(() => draft.value.datasets.some((ds) => ds.regions.some((r) => !isRegionValid(r).ok)))
    const oneConditionWarnings = computed(() =>
      oneConditionGroupWarnings(draft.value.datasets.flatMap((ds) => ds.regions))
    )

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

    /**
     * Edges are derived from auto-generated label groups. For each `auto_*` group,
     * collect the regionKeys assigned to it and emit one edge per pair (region[0], region[i>0]).
     */
    const edges = computed<BoardEdge[]>(() => {
      const out: BoardEdge[] = []
      for (const lg of draft.value.labelGroups) {
        if (!lg.name.startsWith('auto_')) continue
        const assigned: string[] = []
        for (const ds of draft.value.datasets) {
          for (const r of ds.regions) {
            if (r.labelGroupName === lg.name) assigned.push(r.regionKey)
          }
        }
        if (assigned.length < 2) continue
        for (let i = 1; i < assigned.length; i++) {
          out.push({ from: assigned[0], to: assigned[i] })
        }
      }
      return out
    })

    /** Mapping chips for MatchModeSelector — one per edge, using a "ds - region → ds - region" label. */
    const mappings = computed<MappingChip[]>(() => {
      const regionContext = (regionKey: string): { dsName: string; label: string } | null => {
        for (const ds of draft.value.datasets) {
          const r = ds.regions.find((x) => x.regionKey === regionKey)
          if (r) {
            const info = datasetInfo(ds.datasetId)
            return {
              dsName: info.name,
              label: sharedRegionLabel(
                r,
                roisByDataset.value[ds.datasetId] ?? [],
                segmentationsByDataset.value[ds.datasetId] ?? []
              ),
            }
          }
        }
        return null
      }
      return edges.value.map((e) => {
        const a = regionContext(e.from)
        const b = regionContext(e.to)
        const label = a && b ? `${a.dsName} - ${a.label} → ${b.dsName} - ${b.label}` : `${e.from} → ${e.to}`
        return { id: `${e.from}|${e.to}`, label }
      })
    })

    /** Allocate a fresh `auto_N` group name not currently in the draft. */
    const nextAutoGroupName = (): string => {
      const used = new Set(draft.value.labelGroups.map((g) => g.name))
      let n = draft.value.labelGroups.length + 1
      while (used.has(`auto_${n}`)) n++
      return `auto_${n}`
    }

    const onAddEdge = (e: BoardEdge): void => {
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

    const onRemoveMapping = (mappingId: string): void => {
      const [from, to] = mappingId.split('|')
      // Find the auto_* group that owns both endpoints.
      const groupName = draft.value.labelGroups
        .filter((g) => g.name.startsWith('auto_'))
        .find((g) => {
          const assigned: string[] = []
          for (const ds of draft.value.datasets) {
            for (const r of ds.regions) {
              if (r.labelGroupName === g.name) assigned.push(r.regionKey)
            }
          }
          return assigned.includes(from) && assigned.includes(to)
        })?.name
      if (!groupName) return
      const datasets = draft.value.datasets.map((ds) => ({
        ...ds,
        regions: ds.regions.map((r) => (r.labelGroupName === groupName ? { ...r, labelGroupName: null } : r)),
      }))
      const labelGroups = draft.value.labelGroups.filter((g) => g.name !== groupName)
      draft.value = { ...draft.value, labelGroups, datasets }
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
    })

    return () => (
      <div class="m-8 max-w-5xl">
        <h1 class="text-2xl mb-4" data-test-key="experiment-edit-title">
          {isEdit.value ? 'Edit experiment' : 'Create experiment'}
        </h1>

        <ElCard class="mb-6">
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

        <ElCard class="mb-6">
          <h2 class="text-lg mb-2">Datasets</h2>
          <DatasetSelector
            candidates={candidates.value}
            modelValue={draft.value.datasets}
            onUpdate:modelValue={onDatasetsChange}
          />
        </ElCard>

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
              dataset={datasetInfo(d.datasetId)}
              modelValue={d}
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

        {oneConditionWarnings.value.length > 0 && (
          <div
            class="bg-yellow-50 border border-yellow-300 rounded p-2 text-sm mb-4"
            data-test-key="one-condition-warning"
          >
            {oneConditionWarnings.value.map((warning) => (
              <div key={warning.labelGroupName}>
                Label group <strong>{warning.labelGroupName}</strong> has only one condition (
                {warning.conditions.join(', ')}); a statistical test cannot be inferred.
              </div>
            ))}
          </div>
        )}

        <ElCard class="mb-6">
          <h2 class="text-lg mb-2">Region mapping</h2>
          <RegionMappingBoard
            data-test-key="mapping-board"
            columns={columns.value}
            edges={edges.value}
            onAdd-edge={onAddEdge}
            onRemove-edge={(e: BoardEdge) => onRemoveMapping(`${e.from}|${e.to}`)}
          />
        </ElCard>

        <ElCard class="mb-6">
          <MatchModeSelector
            modelValue={draft.value.matchMode}
            mappings={mappings.value}
            onUpdate:modelValue={onMatchModeChange}
            onRemove-mapping={onRemoveMapping}
          />
        </ElCard>

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
    )
  },
})
