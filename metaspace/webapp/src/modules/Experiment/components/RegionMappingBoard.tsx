import { defineComponent, PropType, ref } from 'vue'

export interface BoardRegion {
  regionKey: string
  label: string
  color: string
}

export interface BoardColumn {
  datasetId: string
  name: string
  regions: BoardRegion[]
}

export interface BoardEdge {
  from: string
  to: string
}

export default defineComponent({
  name: 'RegionMappingBoard',
  props: {
    columns: { type: Array as PropType<BoardColumn[]>, required: true },
    edges: { type: Array as PropType<BoardEdge[]>, default: () => [] },
  },
  emits: ['add-edge', 'remove-edge'],
  setup(props, { emit }) {
    const selected = ref<{ regionKey: string; datasetId: string } | null>(null)
    const cellRefs = ref<Record<string, HTMLElement | null>>({})
    const containerRef = ref<HTMLElement | null>(null)

    const setCell =
      (key: string) =>
      (el: unknown): void => {
        cellRefs.value[key] = el as HTMLElement | null
      }

    const edgePath = (from: string, to: string): string => {
      const a = cellRefs.value[from]
      const b = cellRefs.value[to]
      const c = containerRef.value
      if (!a || !b || !c) return ''
      const ar = a.getBoundingClientRect()
      const br = b.getBoundingClientRect()
      const cr = c.getBoundingClientRect()
      const x1 = ar.right - cr.left
      const y1 = ar.top + ar.height / 2 - cr.top
      const x2 = br.left - cr.left
      const y2 = br.top + br.height / 2 - cr.top
      const mid = (x1 + x2) / 2
      return `M ${x1} ${y1} C ${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`
    }

    const onClick = (datasetId: string, regionKey: string): void => {
      if (selected.value?.regionKey === regionKey) {
        selected.value = null
        return
      }
      if (!selected.value) {
        selected.value = { regionKey, datasetId }
        return
      }
      if (selected.value.datasetId === datasetId) {
        selected.value = { regionKey, datasetId }
        return
      }
      emit('add-edge', { from: selected.value.regionKey, to: regionKey })
      selected.value = null
    }

    return () => (
      <div ref={(el) => (containerRef.value = el as HTMLElement | null)} class="relative flex gap-4">
        {props.columns.map((c) => (
          <div key={c.datasetId} class="flex-1 border rounded p-2 bg-white">
            <div class="font-medium mb-2">{c.name}</div>
            {c.regions.map((r) => {
              const isSelected = selected.value?.regionKey === r.regionKey
              return (
                <div
                  key={r.regionKey}
                  ref={setCell(r.regionKey)}
                  data-test-key={`region-cell-${r.regionKey}`}
                  class={[
                    'flex items-center gap-2 p-1 cursor-pointer rounded',
                    isSelected ? 'bg-blue-100' : 'hover:bg-gray-50',
                  ]}
                  onClick={() => onClick(c.datasetId, r.regionKey)}
                >
                  <span class="w-3 h-3 rounded-full" style={{ background: r.color }} />
                  <span>{r.label}</span>
                </div>
              )
            })}
          </div>
        ))}
        <svg class="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
          {props.edges.map((e, i) => (
            <path
              key={`${e.from}-${e.to}`}
              data-test-key={`edge-${i}`}
              d={edgePath(e.from, e.to)}
              stroke="#888"
              stroke-width="2"
              fill="none"
            />
          ))}
        </svg>
      </div>
    )
  },
})
