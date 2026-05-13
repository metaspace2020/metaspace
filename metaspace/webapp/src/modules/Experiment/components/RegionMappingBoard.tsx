import { defineComponent, PropType, ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { View, Hide, Rank } from '@element-plus/icons-vue'
import { ElAlert, ElIcon } from '../../../lib/element-plus'

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
  /** Optional stroke color; falls back to a neutral gray. */
  color?: string
}

interface DragState {
  fromKey: string
  fromDatasetId: string
  fromSide: 'left' | 'right'
  cursorX: number
  cursorY: number
}

const NEUTRAL_EDGE = '#6b7280'
const COLUMN_DRAG_MIME = 'application/x-region-board-column'
const ROW_DRAG_MIME = 'application/x-region-board-row'

export default defineComponent({
  name: 'RegionMappingBoard',
  props: {
    columns: { type: Array as PropType<BoardColumn[]>, required: true },
    edges: { type: Array as PropType<BoardEdge[]>, default: () => [] },
  },
  emits: ['add-edge', 'remove-edge', 'reorder', 'reorder-region'],
  setup(props, { emit }) {
    const selected = ref<{ regionKey: string; datasetId: string } | null>(null)
    const hidden = ref<Set<string>>(new Set())
    const handleRefs = ref<Record<string, HTMLElement | null>>({})
    const columnRefs = ref<Record<string, HTMLElement | null>>({})
    const containerRef = ref<HTMLElement | null>(null)
    const drag = ref<DragState | null>(null)
    const draggingColumnId = ref<string | null>(null)
    const reorderTargetIdx = ref<number | null>(null)
    const draggingRow = ref<{ datasetId: string; regionKey: string } | null>(null)
    const rowReorderTarget = ref<{ datasetId: string; idx: number } | null>(null)
    /** Bumped whenever the column DOM has reflowed; referenced inside `edgePath` so the SVG
     * paths re-evaluate against the new bounding rects (which Vue cannot observe on its own). */
    const layoutVersion = ref(0)
    let layoutObserver: ResizeObserver | null = null

    const bumpLayout = (): void => {
      layoutVersion.value++
    }

    const attachLayoutObserver = (): void => {
      if (typeof ResizeObserver === 'undefined') return
      layoutObserver?.disconnect()
      layoutObserver = new ResizeObserver(() => bumpLayout())
      if (containerRef.value) layoutObserver.observe(containerRef.value)
      for (const id of Object.keys(columnRefs.value)) {
        const el = columnRefs.value[id]
        if (el) layoutObserver.observe(el)
      }
    }

    watch(
      () => props.columns.map((c) => c.datasetId).join('|'),
      async () => {
        await nextTick()
        attachLayoutObserver()
        bumpLayout()
      }
    )

    // Row reorders don't resize columns, so the ResizeObserver doesn't fire and edge SVG
    // paths read stale bounding rects. Bump layoutVersion explicitly when the per-column
    // region order changes. Use double-bump (microtask + animation frame) so paths recompute
    // both immediately after DOM patch and again after the browser has laid out the new rows.
    watch(
      () => props.columns.map((c) => `${c.datasetId}:${c.regions.map((r) => r.regionKey).join(',')}`).join('|'),
      async () => {
        await nextTick()
        bumpLayout()
        requestAnimationFrame(() => bumpLayout())
      }
    )

    onMounted(() => {
      attachLayoutObserver()
      bumpLayout()
    })

    const visibleColumns = computed(() => props.columns.filter((c) => !hidden.value.has(c.datasetId)))
    const hiddenCount = computed(() => props.columns.length - visibleColumns.value.length)

    /**
     * Position of each column in the overall list. Only the very first card (overall) hides
     * its left handle, and only the very last card (overall) hides its right handle.
     */
    const rowPositionByColumn = computed<Record<string, { first: boolean; last: boolean }>>(() => {
      const out: Record<string, { first: boolean; last: boolean }> = {}
      props.columns.forEach((c, i) => {
        out[c.datasetId] = { first: i === 0, last: i === props.columns.length - 1 }
      })
      return out
    })

    /** Color of the first edge touching this region, used to tint dots/handles when connected. */
    const colorByRegion = computed<Record<string, string>>(() => {
      const out: Record<string, string> = {}
      for (const e of props.edges) {
        const c = e.color ?? NEUTRAL_EDGE
        if (!out[e.from]) out[e.from] = c
        if (!out[e.to]) out[e.to] = c
      }
      return out
    })

    const setHandle =
      (key: string) =>
      (el: unknown): void => {
        handleRefs.value[key] = el as HTMLElement | null
      }

    const setColumn =
      (datasetId: string) =>
      (el: unknown): void => {
        columnRefs.value[datasetId] = el as HTMLElement | null
      }

    const handleAnchor = (key: string): { x: number; y: number } | null => {
      const el = handleRefs.value[key]
      const c = containerRef.value
      if (!el || !c) return null
      const r = el.getBoundingClientRect()
      const cr = c.getBoundingClientRect()
      return { x: r.left + r.width / 2 - cr.left, y: r.top + r.height / 2 - cr.top }
    }

    const simpleCurve = (x1: number, y1: number, x2: number, y2: number): string => {
      const mid = (x1 + x2) / 2
      return `M ${x1} ${y1} C ${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`
    }

    const datasetOfRegion = (regionKey: string): string | null => {
      for (const c of props.columns) {
        if (c.regions.some((r) => r.regionKey === regionKey)) return c.datasetId
      }
      return null
    }

    /**
     * Path from `from`'s right handle to `to`'s left handle.
     *
     * - When source and target columns are adjacent, draw a short cubic curve.
     * - When non-participating columns sit between them, route through an orthogonal "lane"
     *   above all cards: source → out → up to lane → across → down to target → in. Each edge
     *   gets its own lane Y based on `edgeIdx`, so multiple skip-edges don't stack on top of
     *   one another. Corners are rounded with quadratic Bezier joints.
     */
    const edgePath = (from: string, to: string, edgeIdx: number): string => {
      // Touch layoutVersion so this re-evaluates whenever the DOM has reflowed.
      void layoutVersion.value
      const a = handleAnchor(`${from}:right`)
      const fromDs = datasetOfRegion(from)
      const toDs = datasetOfRegion(to)
      // Same-column edges: route out the right side of the card so the line never crosses
      // the row label or column title. Anchor on right→right handles instead of right→left.
      if (fromDs && toDs && fromDs === toDs) {
        const bRight = handleAnchor(`${to}:right`)
        if (!a || !bRight) return ''
        const col = columnRefs.value[fromDs]
        const cr2 = containerRef.value?.getBoundingClientRect()
        const stubX = col && cr2 ? col.getBoundingClientRect().right - cr2.left + 2 + edgeIdx * 3 : a.x + 8
        const r = 6
        const goingDown = bRight.y > a.y
        const dirY = goingDown ? 1 : -1
        return [
          `M ${a.x} ${a.y}`,
          `L ${stubX - r} ${a.y}`,
          `Q ${stubX} ${a.y} ${stubX} ${a.y + dirY * r}`,
          `L ${stubX} ${bRight.y - dirY * r}`,
          `Q ${stubX} ${bRight.y} ${stubX - r} ${bRight.y}`,
          `L ${bRight.x} ${bRight.y}`,
        ].join(' ')
      }
      const b = handleAnchor(`${to}:left`)
      if (!a || !b) return ''
      if (!fromDs || !toDs || !containerRef.value) return simpleCurve(a.x, a.y, b.x, b.y)
      const cr = containerRef.value.getBoundingClientRect()
      const fromIdx = props.columns.findIndex((c) => c.datasetId === fromDs)
      const toIdx = props.columns.findIndex((c) => c.datasetId === toDs)
      const [lo, hi] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx]

      // Cross-row routing: drop into the inter-row gap, traverse, rise into target. The
      // vertical segments live in the empty channel just outside each card so they never
      // slice through other cards.
      const fromCol = columnRefs.value[fromDs]
      const toCol = columnRefs.value[toDs]
      if (fromCol && toCol && Math.abs(fromCol.getBoundingClientRect().top - toCol.getBoundingClientRect().top) > 2) {
        const fromRect = fromCol.getBoundingClientRect()
        const toRect = toCol.getBoundingClientRect()
        const goingDown = fromRect.top < toRect.top
        const sourceRowBottom = fromRect.bottom - cr.top
        const sourceRowTop = fromRect.top - cr.top
        const targetRowTop = toRect.top - cr.top
        const targetRowBottom = toRect.bottom - cr.top
        const r = 6
        const dirY = goingDown ? 1 : -1
        const x1Out = fromRect.right - cr.left + 8
        const x2In = toRect.left - cr.left - 8

        // Detect any column that sits in a row strictly between source and target. If so,
        // a single horizontal lane between source and target rows would slice through those
        // intermediate cards' titles. Route around the right-most column edge instead, with
        // one lane just below source row and another just above target row — both cleanly
        // in the inter-row gaps.
        const hasIntermediate = props.columns.some((c) => {
          if (c.datasetId === fromDs || c.datasetId === toDs) return false
          const col = columnRefs.value[c.datasetId]
          if (!col) return false
          const top = col.getBoundingClientRect().top
          if (goingDown) return top > fromRect.top + 2 && top < toRect.top - 2
          return top < fromRect.top - 2 && top > toRect.top + 2
        })

        if (hasIntermediate) {
          const lane1 = goingDown ? sourceRowBottom + 16 : sourceRowTop - 16
          const lane2 = goingDown ? targetRowTop - 16 : targetRowBottom + 16
          // Far-right detour x: past every column's right edge, with per-edge offset so
          // multiple detours fan out instead of overlapping.
          const allRights = props.columns
            .map((c) => columnRefs.value[c.datasetId])
            .filter((el): el is HTMLElement => !!el)
            .map((el) => el.getBoundingClientRect().right - cr.left)
          const farRightX = (allRights.length ? Math.max(...allRights) : x1Out) + 16 + edgeIdx * 5
          return [
            `M ${a.x} ${a.y}`,
            `L ${x1Out - r} ${a.y}`,
            `Q ${x1Out} ${a.y} ${x1Out} ${a.y + dirY * r}`,
            `L ${x1Out} ${lane1 - dirY * r}`,
            `Q ${x1Out} ${lane1} ${x1Out + r} ${lane1}`,
            `L ${farRightX - r} ${lane1}`,
            `Q ${farRightX} ${lane1} ${farRightX} ${lane1 + dirY * r}`,
            `L ${farRightX} ${lane2 - dirY * r}`,
            `Q ${farRightX} ${lane2} ${farRightX - r} ${lane2}`,
            `L ${x2In + r} ${lane2}`,
            `Q ${x2In} ${lane2} ${x2In} ${lane2 + dirY * r}`,
            `L ${x2In} ${b.y - dirY * r}`,
            `Q ${x2In} ${b.y} ${x2In + r} ${b.y}`,
            `L ${b.x} ${b.y}`,
          ].join(' ')
        }

        // Adjacent rows: keep the simpler single-lane routing.
        const baseLane = goingDown
          ? sourceRowBottom + (targetRowTop - sourceRowBottom) * 0.5
          : targetRowBottom + (sourceRowTop - targetRowBottom) * 0.5
        const lane = baseLane + (goingDown ? 1 : -1) * edgeIdx * 6
        const horizDir = x2In >= x1Out ? 1 : -1
        return [
          `M ${a.x} ${a.y}`,
          `L ${x1Out - r} ${a.y}`,
          `Q ${x1Out} ${a.y} ${x1Out} ${a.y + dirY * r}`,
          `L ${x1Out} ${lane - dirY * r}`,
          `Q ${x1Out} ${lane} ${x1Out + horizDir * r} ${lane}`,
          `L ${x2In - horizDir * r} ${lane}`,
          `Q ${x2In} ${lane} ${x2In} ${lane + dirY * r}`,
          `L ${x2In} ${b.y - dirY * r}`,
          `Q ${x2In} ${b.y} ${x2In + r} ${b.y}`,
          `L ${b.x} ${b.y}`,
        ].join(' ')
      }

      let topMost: number | null = null
      for (let i = lo + 1; i < hi; i++) {
        const col = columnRefs.value[props.columns[i].datasetId]
        if (!col) continue
        const colRect = col.getBoundingClientRect()
        // Only count cards that share a row with the endpoints.
        if (fromCol && Math.abs(colRect.top - fromCol.getBoundingClientRect().top) > 2) continue
        const top = colRect.top - cr.top
        topMost = topMost == null ? top : Math.min(topMost, top)
      }
      if (topMost == null) return simpleCurve(a.x, a.y, b.x, b.y)

      const stub = 28 // horizontal run before turning up/down (gives breathing room either side)
      const lane = topMost - 18 - edgeIdx * 8 // unique Y per edge so they fan out
      const r = 6 // corner radius
      const goingRight = b.x > a.x
      const x1Out = goingRight ? a.x + stub : a.x - stub
      const x2In = goingRight ? b.x - stub : b.x + stub
      const horizDir = goingRight ? 1 : -1

      // Polyline with quadratic-Bezier rounded corners.
      return [
        `M ${a.x} ${a.y}`,
        `L ${x1Out - horizDir * r} ${a.y}`,
        `Q ${x1Out} ${a.y} ${x1Out} ${a.y - r}`,
        `L ${x1Out} ${lane + r}`,
        `Q ${x1Out} ${lane} ${x1Out + horizDir * r} ${lane}`,
        `L ${x2In - horizDir * r} ${lane}`,
        `Q ${x2In} ${lane} ${x2In} ${lane + r}`,
        `L ${x2In} ${b.y - r}`,
        `Q ${x2In} ${b.y} ${x2In + horizDir * r} ${b.y}`,
        `L ${b.x} ${b.y}`,
      ].join(' ')
    }

    const dragPath = computed<string>(() => {
      if (!drag.value) return ''
      const a = handleAnchor(`${drag.value.fromKey}:${drag.value.fromSide}`)
      if (!a) return ''
      return simpleCurve(a.x, a.y, drag.value.cursorX, drag.value.cursorY)
    })

    const onPointerMove = (ev: PointerEvent): void => {
      if (!drag.value || !containerRef.value) return
      const cr = containerRef.value.getBoundingClientRect()
      drag.value = { ...drag.value, cursorX: ev.clientX - cr.left, cursorY: ev.clientY - cr.top }
    }

    const findHandleAt = (clientX: number, clientY: number): { regionKey: string; datasetId: string } | null => {
      const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null
      const handle = el?.closest('[data-handle-key]') as HTMLElement | null
      if (!handle) return null
      const regionKey = handle.dataset.handleKey
      const datasetId = handle.dataset.handleDataset
      if (!regionKey || !datasetId) return null
      return { regionKey, datasetId }
    }

    const stopDrag = (): void => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      drag.value = null
    }

    const onPointerUp = (ev: PointerEvent): void => {
      if (!drag.value) return stopDrag()
      const target = findHandleAt(ev.clientX, ev.clientY)
      const fromKey = drag.value.fromKey
      const fromDataset = drag.value.fromDatasetId
      stopDrag()
      void fromDataset
      if (!target || target.regionKey === fromKey) return
      emit('add-edge', { from: fromKey, to: target.regionKey })
    }

    const onHandlePointerDown = (
      ev: PointerEvent,
      datasetId: string,
      regionKey: string,
      side: 'left' | 'right'
    ): void => {
      ev.preventDefault()
      ev.stopPropagation()
      if (!containerRef.value) return
      const cr = containerRef.value.getBoundingClientRect()
      drag.value = {
        fromKey: regionKey,
        fromDatasetId: datasetId,
        fromSide: side,
        cursorX: ev.clientX - cr.left,
        cursorY: ev.clientY - cr.top,
      }
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
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
      emit('add-edge', { from: selected.value.regionKey, to: regionKey })
      selected.value = null
    }

    const toggleHidden = (datasetId: string): void => {
      const next = new Set(hidden.value)
      if (next.has(datasetId)) next.delete(datasetId)
      else next.add(datasetId)
      hidden.value = next
    }

    const showAll = (): void => {
      hidden.value = new Set()
    }

    // Column reorder via native HTML5 drag-and-drop. Drop targets are the gap zones rendered
    // *between* columns (and at each end), so the user can clearly see where the dataset will
    // land instead of having to drop on top of another card.
    const onColumnDragStart = (ev: DragEvent, datasetId: string): void => {
      if (!ev.dataTransfer) return
      ev.dataTransfer.effectAllowed = 'move'
      ev.dataTransfer.setData(COLUMN_DRAG_MIME, datasetId)
      ev.dataTransfer.setData('text/plain', datasetId)
      draggingColumnId.value = datasetId
    }

    const onColumnDragEnd = (): void => {
      draggingColumnId.value = null
      reorderTargetIdx.value = null
    }

    const onGapDragOver = (ev: DragEvent, idx: number): void => {
      const types = ev.dataTransfer?.types
      if (!types || !Array.from(types).includes(COLUMN_DRAG_MIME)) return
      ev.preventDefault()
      ev.dataTransfer!.dropEffect = 'move'
      reorderTargetIdx.value = idx
    }

    const onGapDragLeave = (idx: number): void => {
      if (reorderTargetIdx.value === idx) reorderTargetIdx.value = null
    }

    const onGapDrop = (ev: DragEvent, idx: number): void => {
      const from = ev.dataTransfer?.getData(COLUMN_DRAG_MIME)
      const wasIdx = reorderTargetIdx.value
      reorderTargetIdx.value = null
      draggingColumnId.value = null
      if (!from || idx !== wasIdx) return
      ev.preventDefault()
      emit('reorder', { from, toIndex: idx })
    }

    // Row reorder via native HTML5 drag-and-drop, mirrors column reorder. Drop zones render
    // *between* rows of the same column so a region can be repositioned within its dataset.
    const onRowDragStart = (ev: DragEvent, datasetId: string, regionKey: string): void => {
      if (!ev.dataTransfer) return
      ev.dataTransfer.effectAllowed = 'move'
      ev.dataTransfer.setData(ROW_DRAG_MIME, `${datasetId}::${regionKey}`)
      ev.dataTransfer.setData('text/plain', regionKey)
      draggingRow.value = { datasetId, regionKey }
    }

    const onRowDragEnd = (): void => {
      draggingRow.value = null
      rowReorderTarget.value = null
    }

    const onRowGapDragOver = (ev: DragEvent, datasetId: string, idx: number): void => {
      const types = ev.dataTransfer?.types
      if (!types || !Array.from(types).includes(ROW_DRAG_MIME)) return
      if (draggingRow.value?.datasetId !== datasetId) return
      ev.preventDefault()
      ev.dataTransfer!.dropEffect = 'move'
      rowReorderTarget.value = { datasetId, idx }
    }

    const onRowGapDragLeave = (datasetId: string, idx: number): void => {
      const cur = rowReorderTarget.value
      if (cur && cur.datasetId === datasetId && cur.idx === idx) rowReorderTarget.value = null
    }

    const onRowGapDrop = (ev: DragEvent, datasetId: string, idx: number): void => {
      const payload = ev.dataTransfer?.getData(ROW_DRAG_MIME)
      const cur = rowReorderTarget.value
      rowReorderTarget.value = null
      const dragging = draggingRow.value
      draggingRow.value = null
      if (!payload || !cur || cur.datasetId !== datasetId || cur.idx !== idx) return
      const [dsId, regionKey] = payload.split('::')
      if (dsId !== datasetId || !dragging || dragging.datasetId !== datasetId) return
      ev.preventDefault()
      emit('reorder-region', { datasetId, regionKey, toIndex: idx })
    }

    const rowGapIsNoop = (datasetId: string, idx: number): boolean => {
      const cur = draggingRow.value
      if (!cur || cur.datasetId !== datasetId) return false
      const col = props.columns.find((c) => c.datasetId === datasetId)
      if (!col) return false
      const fromIdx = col.regions.findIndex((r) => r.regionKey === cur.regionKey)
      return fromIdx === idx || fromIdx === idx - 1
    }

    /** Whether the gap at `idx` is a no-op (dropping there leaves order unchanged). */
    const gapIsNoop = (idx: number): boolean => {
      const fromId = draggingColumnId.value
      if (!fromId) return false
      const fromIdx = props.columns.findIndex((c) => c.datasetId === fromId)
      return fromIdx === idx || fromIdx === idx - 1
    }

    onBeforeUnmount(() => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      layoutObserver?.disconnect()
    })

    const renderHandle = (
      datasetId: string,
      regionKey: string,
      side: 'left' | 'right',
      tint: string | null,
      visible: boolean
    ): JSX.Element => (
      <span
        ref={setHandle(`${regionKey}:${side}`)}
        data-handle-key={regionKey}
        data-handle-dataset={datasetId}
        draggable="false"
        data-test-key={`region-handle-${regionKey}-${side}`}
        class="w-3 h-3 rounded-full flex-shrink-0"
        style={{
          border: visible ? `1.5px solid ${tint ?? '#9ca3af'}` : 'none',
          background: visible ? tint ?? '#ffffff' : 'transparent',
          boxSizing: 'border-box',
          visibility: visible ? 'visible' : 'hidden',
          cursor: visible ? 'crosshair' : 'default',
        }}
        onPointerdown={(ev: PointerEvent) => visible && onHandlePointerDown(ev, datasetId, regionKey, side)}
      />
    )

    const renderColumn = (c: BoardColumn): JSX.Element => {
      const isHidden = hidden.value.has(c.datasetId)
      if (isHidden) {
        return (
          <div
            key={c.datasetId}
            ref={setColumn(c.datasetId)}
            data-test-key={`region-column-${c.datasetId}`}
            class="w-12 flex-shrink-0 rounded-lg bg-gray-50 p-2 flex flex-col items-center"
            style={{ border: '1px solid #e5e7eb' }}
          >
            <button
              class="text-gray-500 hover:text-blue-500 cursor-pointer"
              style={{ background: 'transparent', border: 'none', padding: 0 }}
              data-test-key={`column-toggle-${c.datasetId}`}
              onClick={() => toggleHidden(c.datasetId)}
              title={`Show ${c.name}`}
            >
              <ElIcon>
                <Hide />
              </ElIcon>
            </button>
            <div class="text-xs text-gray-500 mt-2 [writing-mode:vertical-rl] truncate max-h-32" title={c.name}>
              {c.name}
            </div>
          </div>
        )
      }
      return (
        <div
          key={c.datasetId}
          ref={setColumn(c.datasetId)}
          data-test-key={`region-column-${c.datasetId}`}
          class="w-56 flex-shrink-0 rounded-lg bg-white p-3"
          style={{ border: '1px solid #e5e7eb' }}
        >
          <div class="flex items-center justify-between mb-2 gap-2">
            <span
              draggable="true"
              data-test-key={`column-drag-${c.datasetId}`}
              class="text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing flex-shrink-0"
              title="Drag to reorder dataset"
              onDragstart={(ev: DragEvent) => onColumnDragStart(ev, c.datasetId)}
              onDragend={onColumnDragEnd}
            >
              <ElIcon>
                <Rank />
              </ElIcon>
            </span>
            <div class="font-medium truncate flex-1 select-none" title={c.name}>
              {c.name}
            </div>
            <button
              class="text-blue-500 hover:text-blue-700 cursor-pointer"
              style={{ background: 'transparent', border: 'none', padding: 0 }}
              data-test-key={`column-toggle-${c.datasetId}`}
              onClick={() => toggleHidden(c.datasetId)}
              title="Hide column"
            >
              <ElIcon>
                <View />
              </ElIcon>
            </button>
          </div>
          {c.regions.map((r, ri) => {
            const isSelected = selected.value?.regionKey === r.regionKey
            const tint = colorByRegion.value[r.regionKey] ?? null
            const connected = !!tint
            const rowPos = rowPositionByColumn.value[c.datasetId] ?? { first: false, last: false }
            return (
              <>
                {renderRowGap(c.datasetId, ri)}
                <div
                  key={r.regionKey}
                  data-test-key={`region-cell-${r.regionKey}`}
                  class={[
                    'flex items-center gap-1 px-2 py-1 my-1 rounded cursor-pointer transition-colors',
                    isSelected ? 'bg-blue-50' : connected ? 'bg-blue-50' : 'hover:bg-gray-50',
                  ]}
                  style={{
                    border: isSelected
                      ? `1px solid ${tint ?? '#3b82f6'}`
                      : connected
                      ? `1px solid ${tint}`
                      : '1px solid #e5e7eb',
                  }}
                  onClick={() => onClick(c.datasetId, r.regionKey)}
                >
                  <span
                    draggable="true"
                    data-test-key={`region-drag-${r.regionKey}`}
                    class="text-gray-300 hover:text-gray-500 cursor-grab
                     active:cursor-grabbing flex-shrink-0 inline-flex
                     items-center justify-center"
                    style={{ width: '20px', height: '20px', margin: '-4px 0' }}
                    title="Drag to reorder region"
                    onMousedown={(ev: MouseEvent) => ev.stopPropagation()}
                    onClick={(ev: MouseEvent) => ev.stopPropagation()}
                    onDragstart={(ev: DragEvent) => onRowDragStart(ev, c.datasetId, r.regionKey)}
                    onDragend={onRowDragEnd}
                  >
                    <ElIcon>
                      <Rank />
                    </ElIcon>
                  </span>
                  {renderHandle(c.datasetId, r.regionKey, 'left', tint, !rowPos.first)}
                  <span class="w-3 h-3 rounded-full flex-shrink-0" style={{ background: tint ?? r.color }} />
                  <span class="flex-1 truncate select-none" title={r.label}>
                    {r.label}
                  </span>
                  {renderHandle(c.datasetId, r.regionKey, 'right', tint, true)}
                </div>
              </>
            )
          })}
          {renderRowGap(c.datasetId, c.regions.length)}
        </div>
      )
    }

    const renderRowGap = (datasetId: string, idx: number): JSX.Element | null => {
      const draggingThis = draggingRow.value?.datasetId === datasetId
      const isActive = rowReorderTarget.value?.datasetId === datasetId && rowReorderTarget.value?.idx === idx
      const isNoop = rowGapIsNoop(datasetId, idx)
      // Always rendered (zero-height when idle) so the DOM doesn't reflow mid-drag — that
      // reflow was breaking subsequent drags after the first one.
      return (
        <div
          key={`row-gap-${datasetId}-${idx}`}
          data-test-key={`row-gap-${datasetId}-${idx}`}
          class="w-full flex-shrink-0"
          style={{ height: draggingThis ? (isActive ? '14px' : '8px') : '0px', transition: 'height 120ms ease' }}
          onDragover={(ev: DragEvent) => !isNoop && onRowGapDragOver(ev, datasetId, idx)}
          onDragleave={() => onRowGapDragLeave(datasetId, idx)}
          onDrop={(ev: DragEvent) => !isNoop && onRowGapDrop(ev, datasetId, idx)}
        >
          <div
            class="w-full h-full rounded"
            style={{
              background: isActive && !isNoop ? '#9ca3af' : 'transparent',
              transition: 'background 120ms ease',
            }}
          />
        </div>
      )
    }

    const renderGap = (idx: number): JSX.Element | null => {
      const dragging = !!draggingColumnId.value
      if (!dragging) return <div key={`gap-${idx}`} class="w-2 flex-shrink-0" />
      const isActive = reorderTargetIdx.value === idx
      const isNoop = gapIsNoop(idx)
      return (
        <div
          key={`gap-${idx}`}
          data-test-key={`column-gap-${idx}`}
          class="flex-shrink-0 self-stretch flex items-center justify-center"
          style={{ width: isActive ? '40px' : '12px', transition: 'width 120ms ease' }}
          onDragover={(ev: DragEvent) => !isNoop && onGapDragOver(ev, idx)}
          onDragleave={() => onGapDragLeave(idx)}
          onDrop={(ev: DragEvent) => !isNoop && onGapDrop(ev, idx)}
        >
          <div
            class="w-full h-[80%] rounded"
            style={{
              background: isActive && !isNoop ? '#9ca3af' : isNoop ? 'transparent' : '#e5e7eb',
              transition: 'background 120ms ease',
            }}
          />
        </div>
      )
    }

    return () => (
      <div class="space-y-3">
        <div class="flex flex-col items-end ">
          <ElAlert
            type="info"
            show-icon={true}
            closable={false}
            class="flex-1"
            v-slots={{
              default: () => (
                <div class="text-xs leading-relaxed space-y-1">
                  <div>
                    To link regions across datasets, click a region's circular handle{' '}
                    <span
                      class="inline-block w-3 h-3 rounded-full align-middle"
                      style={{ border: '1.5px solid #6b7280', background: '#fff' }}
                    />{' '}
                    and then click another region's handle. Linked regions share a color. Click additional handles to
                    chain more regions into the same group, and click a linked handle again to remove it from the group.
                  </div>
                  <div>
                    Use the{' '}
                    <ElIcon class="align-middle">
                      <Rank />
                    </ElIcon>{' '}
                    handle to drag a card into a new position, and the{' '}
                    <ElIcon class="align-middle">
                      <View />
                    </ElIcon>{' '}
                    icon to temporarily hide a card so it's easier to connect the remaining ones.
                  </div>
                </div>
              ),
            }}
          />
          {hiddenCount.value > 0 && (
            <button
              class="text-sm text-blue-600 hover:underline cursor-pointer flex-shrink-0 mt-2"
              style={{ background: 'transparent', border: 'none', padding: 0 }}
              data-test-key="show-all-columns"
              onClick={showAll}
            >
              Show all ({hiddenCount.value} hidden)
            </button>
          )}
        </div>
        <div
          ref={(el) => (containerRef.value = el as HTMLElement | null)}
          class="relative flex flex-wrap pt-12 pb-2 justify-center"
          style={{ rowGap: '96px' }}
        >
          {props.columns.flatMap((c, i) => [renderGap(i), renderColumn(c)]).concat([renderGap(props.columns.length)])}
          <svg
            class="absolute inset-0 pointer-events-none"
            style={{ width: '100%', height: '100%', overflow: 'visible' }}
          >
            {props.edges.map((e, i) => (
              <path
                key={`${e.from}-${e.to}`}
                data-test-key={`edge-${i}`}
                d={edgePath(e.from, e.to, i)}
                stroke={e.color ?? NEUTRAL_EDGE}
                stroke-width="2"
                fill="none"
              />
            ))}
            {drag.value && (
              <path
                data-test-key="edge-drag"
                d={dragPath.value}
                stroke="#3b82f6"
                stroke-width="2"
                stroke-dasharray="4 3"
                fill="none"
              />
            )}
          </svg>
        </div>
      </div>
    )
  },
})
