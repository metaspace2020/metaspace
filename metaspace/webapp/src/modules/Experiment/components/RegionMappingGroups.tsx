import { defineComponent, PropType, ref } from 'vue'
import { Edit } from '@element-plus/icons-vue'
import { ElInput, ElSelect, ElOption, ElIcon } from '../../../lib/element-plus'

export interface GroupRegionMember {
  regionKey: string
  label: string
  labelGroupName: string | null
}
export interface GroupDataset {
  datasetId: string
  name: string
  regions: GroupRegionMember[]
}
export interface GroupLabelGroup {
  name: string
  color: string
}

export default defineComponent({
  name: 'RegionMappingGroups',
  props: {
    datasets: { type: Array as PropType<GroupDataset[]>, required: true },
    labelGroups: { type: Array as PropType<GroupLabelGroup[]>, required: true },
    readonly: { type: Boolean, default: false },
    allowAdd: { type: Boolean, default: true },
  },
  emits: [
    'rename-group',
    'add-region-to-group',
    'remove-region-from-group',
    'create-group-with-region',
    'delete-group',
  ],
  setup(props, ctx) {
    const editing = ref<string | null>(null)
    const draftName = ref('')
    const startEdit = (name: string) => {
      editing.value = name
      draftName.value = name
    }
    const commitEdit = (oldName: string) => {
      const next = draftName.value.trim()
      editing.value = null
      if (!next || next === oldName) return
      ctx.emit('rename-group', { oldName, newName: next })
    }

    return () => (
      <div class="flex flex-wrap gap-3  justify-center">
        {props.labelGroups.map((g) => {
          const members: { dsName: string; dsIdx: number; region: GroupRegionMember }[] = []
          props.datasets.forEach((ds, dsIdx) => {
            for (const r of ds.regions) {
              if (r.labelGroupName === g.name) members.push({ dsName: ds.name, dsIdx, region: r })
            }
          })
          if (members.length === 0) return null
          const isEditing = editing.value === g.name
          return (
            <div key={g.name} data-test-key={`group-card-${g.name}`} class="border rounded p-3 min-w-[220px]">
              {isEditing && !props.readonly ? (
                <ElInput
                  data-test-key="group-title-input"
                  modelValue={draftName.value}
                  onUpdate:modelValue={(v: string) => (draftName.value = v)}
                  onKeydown={(e: KeyboardEvent) => {
                    if (e.key === 'Enter') commitEdit(g.name)
                    if (e.key === 'Escape') editing.value = null
                  }}
                  onBlur={() => commitEdit(g.name)}
                />
              ) : (
                <div class="flex items-center justify-between mb-2">
                  <div
                    data-test-key="group-title"
                    class={`text-sm flex-1 ${props.readonly ? '' : 'cursor-text'}`}
                    onClick={() => {
                      if (!props.readonly) startEdit(g.name)
                    }}
                  >
                    Group · "{g.name}"
                    {!props.readonly && (
                      <ElIcon
                        data-test-key={`group-rename-${g.name}`}
                        class="ml-1 align-middle opacity-60 hover:opacity-100"
                        onClick={(e: MouseEvent) => {
                          e.stopPropagation()
                          startEdit(g.name)
                        }}
                      >
                        <Edit />
                      </ElIcon>
                    )}
                  </div>
                  {!props.readonly && (
                    <span
                      data-test-key={`group-delete-${g.name}`}
                      class="cursor-pointer opacity-60 hover:opacity-100 ml-2"
                      onClick={() => ctx.emit('delete-group', { name: g.name })}
                    >
                      ×
                    </span>
                  )}
                </div>
              )}
              {members.map((m) => (
                <div
                  key={m.region.regionKey}
                  data-test-key={`member-row-${m.region.regionKey}`}
                  class="flex items-center gap-2 text-sm"
                >
                  <span class="text-xs opacity-70">DS{m.dsIdx + 1}</span>
                  <span class="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: g.color }} />
                  <span class="flex-1">
                    {m.dsName} · {m.region.label}
                  </span>
                  {!props.readonly && (
                    <span
                      data-test-key={`member-remove-${m.region.regionKey}`}
                      class="cursor-pointer opacity-60 hover:opacity-100"
                      onClick={() => ctx.emit('remove-region-from-group', { regionKey: m.region.regionKey })}
                    >
                      ×
                    </span>
                  )}
                </div>
              ))}
              {!props.readonly && props.allowAdd && (
                <div class="mt-2">
                  <ElSelect
                    modelValue={null}
                    placeholder="+ add region…"
                    onChange={(regionKey: string) => ctx.emit('add-region-to-group', { groupName: g.name, regionKey })}
                  >
                    {props.datasets.flatMap((ds, dsIdx) =>
                      ds.regions
                        .filter((r) => r.labelGroupName !== g.name)
                        .map((r) => (
                          <ElOption
                            key={r.regionKey}
                            value={r.regionKey}
                            label={`DS${dsIdx + 1} · ${ds.name} · ${r.label}`}
                            data-test-key={`add-region-option-${r.regionKey}`}
                          />
                        ))
                    )}
                  </ElSelect>
                </div>
              )}
            </div>
          )
        })}
        {!props.readonly && props.allowAdd && (
          <div data-test-key="unmapped-card" class="border rounded p-3 min-w-[220px]">
            <div class="text-sm mb-2 opacity-70">Unmapped</div>
            {props.datasets.flatMap((ds, dsIdx) =>
              ds.regions
                .filter((r) => r.labelGroupName == null)
                .map((r) => (
                  <div
                    key={r.regionKey}
                    data-test-key={`unmapped-row-${r.regionKey}`}
                    class="flex items-center gap-2 text-sm"
                  >
                    <span class="text-xs opacity-70">DS{dsIdx + 1}</span>
                    <span class="flex-1">
                      {ds.name} · {r.label}
                    </span>
                  </div>
                ))
            )}
          </div>
        )}
        {!props.readonly && props.allowAdd && (
          <div data-test-key="add-group-card" class="border border-dashed rounded p-3 min-w-[220px]">
            <div class="text-sm mb-2 opacity-70">Group · unnamed</div>
            <ElSelect
              modelValue={null}
              placeholder="+ add cluster…"
              onChange={(regionKey: string) => ctx.emit('create-group-with-region', { regionKey })}
            >
              {props.datasets.flatMap((ds, dsIdx) =>
                ds.regions
                  .filter((r) => r.labelGroupName == null)
                  .map((r) => (
                    <ElOption
                      key={r.regionKey}
                      value={r.regionKey}
                      label={`DS${dsIdx + 1} · ${ds.name} · ${r.label}`}
                      data-test-key={`add-cluster-option-${r.regionKey}`}
                    />
                  ))
              )}
            </ElSelect>
          </div>
        )}
      </div>
    )
  },
})
