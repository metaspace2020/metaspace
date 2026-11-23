import { defineComponent, ref, nextTick, onBeforeUnmount, onMounted, PropType, VNode, watch } from 'vue'
import { Delete, Edit, Hide, InfoFilled, View } from '@element-plus/icons-vue'
import { ElButton, ElColorPicker, ElIcon, ElInput, ElOption, ElSelect, ElTooltip } from '../lib/element-plus'
import { channels } from '../lib/getColorScale'
import {
  MAX_GROUP_LABEL_LENGTH,
  RoiGroup,
  displayColor,
  groupNameError,
  hexToRgb,
  nextGroupName,
  nextGroupChannel,
  resolveColor,
  rgbToHex,
  toColorValue,
  toPickerHex,
} from '../lib/roiGroups'
import RoiSectionHeader from './RoiSectionHeader'

export interface RoiGroupPanelRoi {
  key: string
  name: string
  /** The ROI's colour: a palette name or an `rgb(...)` string. */
  channel: string
  groupLabel: string
  visible: boolean
}

interface InputHandle {
  focus: () => void
  select: () => void
}

/** Palette name -> `rgb(...)`, in palette order. */
export const PALETTE_RGB = channels as Record<string, string>

/** The palette as the picker's predefined colours, in its own `#RRGGBB` format. */
const PALETTE_HEX = Object.values(PALETTE_RGB).map(rgbToHex)

/**
 * Colour swatch of a ROI or group row: an Element Plus colour picker (teleported dropdown) whose predefined
 * colours are the palette. The picker works in `#RRGGBB` (its panel shows hex); stored colours stay palette names or
 * `rgb(...)` strings, so values are converted here only. `pick` carries the stored value (palette name or `rgb(...)`
 * string) and its rgb; a cleared or unreadable value is ignored so the previous colour stays. A colour the picker
 * cannot represent (e.g. an imported `hsl()`) is painted behind its swatch so it never looks like "no colour".
 *
 * Clicking the swatch of an open picker must close it. Element Plus 2.4.1 gets this wrong: the dropdown's
 * click-outside directive treats the swatch as "outside" and closes the picker on mouseup (a debounced call that
 * runs at once), then the swatch's own click handler toggles it again; that second debounced call is queued as the
 * trailing call and reopens the picker 100ms later. The swallowed click below is that second toggle: when a
 * mousedown on the swatch finds the picker open, the following click never reaches the picker.
 */
export const RoiColorPicker = defineComponent({
  name: 'RoiColorPicker',
  props: {
    /** The current colour: a palette name, an `rgb(...)` string or any other CSS colour (shown as a fallback). */
    rgb: { type: String, required: true },
    label: { type: String, required: true },
  },
  emits: {
    pick: (value: string, rgb: string) => typeof value === 'string' && typeof rgb === 'string',
  },
  setup(props, { emit }) {
    const root = ref<HTMLElement | null>(null)
    let swallowClick = false

    /** The picker's tooltip sets `aria-describedby` on its trigger exactly while the dropdown is open. */
    const isOpen = (): boolean =>
      root.value?.querySelector('.el-color-picker')?.hasAttribute('aria-describedby') ?? false

    const onMousedown = (e: MouseEvent) => {
      const onSwatch = e.target instanceof Element && e.target.closest('.el-color-picker__trigger') != null
      swallowClick = onSwatch && isOpen()
    }

    const onClick = (e: MouseEvent) => {
      if (swallowClick) {
        e.stopPropagation()
      }
      swallowClick = false
    }

    const onChange = (value: string | null) => {
      const rgb = value == null ? '' : hexToRgb(value)
      const stored = rgb ? toColorValue(rgb, PALETTE_RGB) : null
      if (stored != null) {
        emit('pick', stored, resolveColor(stored, PALETTE_RGB))
      }
    }

    // Capture phase on the wrapper: runs before the picker's own handlers on the swatch
    onMounted(() => {
      root.value?.addEventListener('mousedown', onMousedown, true)
      root.value?.addEventListener('click', onClick, true)
    })
    onBeforeUnmount(() => {
      root.value?.removeEventListener('mousedown', onMousedown, true)
      root.value?.removeEventListener('click', onClick, true)
    })

    return () => {
      const hex = toPickerHex(props.rgb, PALETTE_RGB)
      const fallback = hex === '' && props.rgb.trim() !== ''
      return (
        <span
          ref={root}
          class={['roi-color-picker', { 'has-fallback': fallback }]}
          style={fallback ? { '--roi-picker-fallback': props.rgb } : undefined}
        >
          <ElColorPicker
            size="small"
            modelValue={hex}
            predefine={PALETTE_HEX}
            showAlpha={false}
            colorFormat="hex"
            label={props.label}
            popperClass="roi-color-picker-popper"
            onChange={onChange}
          />
        </span>
      )
    }
  },
})

/** Renders a `RoiColorPicker`; `onPick` receives the stored value and its rgb. */
export const renderColorPicker = (rgb: string, label: string, onPick: (value: string, rgb: string) => void): VNode => (
  <RoiColorPicker rgb={rgb} label={label} onPick={onPick} />
)

/** Visibility toggle shared by ROI rows and group rows: outline eye, struck through when hidden. */
export const renderEyeIcon = (visible: boolean): VNode => <ElIcon size={16}>{visible ? <View /> : <Hide />}</ElIcon>

const UNGROUPED_HINT = 'ROIs without a group are left out of the comparison'

/** Select value of the "New group…" entry; it is only listed while no group exists, so no name can collide with it. */
const NEW_GROUP_OPTION = '__roi-new-group__'

/**
 * Presentational panel for assigning ROIs to groups and managing the groups themselves.
 * Props in, events out; the parent owns all state.
 */
export default defineComponent({
  name: 'RoiGroupPanel',
  props: {
    rois: { type: Array as PropType<RoiGroupPanelRoi[]>, required: true },
    groups: { type: Array as PropType<RoiGroup[]>, required: true },
    assignCollapsed: { type: Boolean, default: false },
    groupListCollapsed: { type: Boolean, default: false },
  },
  emits: {
    assign: (roiKey: string, groupName: string) => typeof roiKey === 'string' && typeof groupName === 'string',
    create: (name: string) => typeof name === 'string',
    rename: (from: string, to: string) => typeof from === 'string' && typeof to === 'string',
    recolor: (name: string, channel: string) => typeof name === 'string' && typeof channel === 'string',
    remove: (name: string) => typeof name === 'string',
    toggleVisible: (name: string) => typeof name === 'string',
    toggleAssign: () => true,
    toggleGroupList: () => true,
  },
  setup(props, { emit }) {
    const creating = ref(false)
    /** Key of the ROI whose "New group…" entry opened the editor: it joins the group once it is created. */
    const pendingAssignKey = ref<string | null>(null)
    const newName = ref('')
    const newError = ref<string | null>(null)
    const newInput = ref<InputHandle | null>(null)

    const renaming = ref<string | null>(null)
    const renameDraft = ref('')
    const renameError = ref<string | null>(null)
    const renameInput = ref<InputHandle | null>(null)

    const focusAndSelect = async (input: { value: InputHandle | null }) => {
      await nextTick()
      input.value?.focus()
      input.value?.select()
    }

    /**
     * Opens the new-group editor. A collapsed Groups section needs no toggle here: with no groups its body always
     * shows, and the parent expands it when the first group is created.
     */
    const startCreate = (forRoiKey: string | null = null) => {
      renaming.value = null
      pendingAssignKey.value = forRoiKey
      creating.value = true
      newName.value = nextGroupName(props.groups)
      newError.value = null
      focusAndSelect(newInput)
    }

    const cancelCreate = () => {
      creating.value = false
      newError.value = null
      pendingAssignKey.value = null
    }

    // A pending "New group…" ROI that is gone must not be assigned; with no ROIs left the editor is not shown, so close
    // it rather than have it reappear open when an ROI is added again
    watch(
      () => props.rois,
      (rois) => {
        if (rois.length === 0) {
          cancelCreate()
        } else if (pendingAssignKey.value != null && !rois.some((roi) => roi.key === pendingAssignKey.value)) {
          pendingAssignKey.value = null
        }
      }
    )

    const commitCreate = () => {
      const error = groupNameError(newName.value, props.groups)
      if (error) {
        newError.value = error
        return
      }
      const name = newName.value.trim()
      const roiKey = pendingAssignKey.value
      // create first: the parent adds the group synchronously, so the assignment that follows finds it
      emit('create', name)
      if (roiKey != null) {
        emit('assign', roiKey, name)
      }
      cancelCreate()
    }

    const startRename = (name: string) => {
      cancelCreate()
      renaming.value = name
      renameDraft.value = name
      renameError.value = null
      focusAndSelect(renameInput)
    }

    const cancelRename = () => {
      renaming.value = null
      renameError.value = null
    }

    const commitRename = () => {
      const from = renaming.value
      if (from == null) {
        return
      }
      const to = renameDraft.value.trim()
      if (to === from) {
        cancelRename()
        return
      }
      const error = groupNameError(to, props.groups, from)
      if (error) {
        renameError.value = error
        return
      }
      emit('rename', from, to)
      cancelRename()
    }

    const onEnterEsc = (commit: () => void, cancel: () => void) => (e: KeyboardEvent) => {
      if (e.isComposing) {
        return // Enter confirms an IME composition; do not commit a half-typed name
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        commit()
      } else if (e.key === 'Escape') {
        e.stopPropagation()
        cancel()
      }
    }

    /**
     * mousedown on the "New group…" option must not move focus into the select's dropdown. If it did, the dropdown's
     * focus trap (Element Plus 2.4.1 focus-trap `startTrap`) would record the element focused before it and, when the
     * dropdown closes after the click (`stopTrap`), focus that element again: after the editor input has already been
     * focused, so the editor loses focus (to the select, or to the ROI panel's button through the popover's own trap)
     * and Enter acts on the wrong element. With the default prevented the select keeps focus, no trap engages, and the
     * click still selects the option.
     */
    const keepFocusOutOfDropdown = (e: MouseEvent) => e.preventDefault()

    const onSelectGroup = (roiKey: string, value: string) => {
      if (value === NEW_GROUP_OPTION) {
        // Not an assignment: open the editor for this ROI; the select stays bound to its value ("No group")
        startCreate(roiKey)
      } else {
        emit('assign', roiKey, value)
      }
    }

    const swatch = (channel: string | undefined) => {
      const rgb = channel ? displayColor(channel, PALETTE_RGB) : ''
      return rgb ? (
        <span class="roi-group-swatch" style={{ background: rgb }} />
      ) : (
        <span class="roi-group-swatch roi-group-swatch-empty" />
      )
    }

    const renderAssignRow = (roi: RoiGroupPanelRoi) => {
      const group = props.groups.find((g) => g.name === roi.groupLabel)
      return (
        <div key={roi.key} class="roi-group-assign-row">
          <span class="roi-indicator-slot">
            <span class="roi-dot" style={{ background: displayColor(roi.channel, PALETTE_RGB) }} />
          </span>
          <span class="roi-group-roi-name" title={roi.name}>
            {roi.name}
          </span>
          {swatch(group?.channel)}
          <ElSelect
            class="roi-group-select"
            size="small"
            modelValue={group ? group.name : ''}
            onUpdate:modelValue={(value: string) => onSelectGroup(roi.key, value)}
          >
            {props.groups.map((g) => (
              <ElOption key={g.name} label={g.name} value={g.name} />
            ))}
            <ElOption key="" label="No group" value="" />
            {props.groups.length === 0 && (
              <ElOption
                key={NEW_GROUP_OPTION}
                label="New group…"
                value={NEW_GROUP_OPTION}
                onMousedown={keepFocusOutOfDropdown}
              />
            )}
          </ElSelect>
        </div>
      )
    }

    const renderGroupRow = (group: RoiGroup) => {
      const members = props.rois.filter((roi) => roi.groupLabel === group.name)
      const anyVisible = members.some((roi) => roi.visible)
      const isRenaming = renaming.value === group.name
      return (
        <div key={group.name} class="roi-group-item">
          <div class="roi-group-line">
            {renderColorPicker(displayColor(group.channel, PALETTE_RGB), `Colour of ${group.name}`, (value) =>
              emit('recolor', group.name, value)
            )}
            {isRenaming ? (
              <div class="roi-group-rename" onKeydown={onEnterEsc(commitRename, cancelRename)}>
                <ElInput
                  ref={renameInput}
                  size="small"
                  maxlength={MAX_GROUP_LABEL_LENGTH}
                  v-model={renameDraft.value}
                />
                {renameError.value && <div class="roi-group-error">{renameError.value}</div>}
              </div>
            ) : (
              <span class="roi-group-name" title={group.name}>
                {group.name}
              </span>
            )}
            <div class="roi-actions">
              <ElButton
                class="button-reset roi-action-btn roi-group-eye-btn"
                aria-label={anyVisible ? 'Hide group' : 'Show group'}
                title={anyVisible ? 'Hide group' : 'Show group'}
                disabled={members.length === 0}
                onClick={() => emit('toggleVisible', group.name)}
              >
                {renderEyeIcon(anyVisible)}
              </ElButton>
              <ElButton
                class="button-reset roi-action-btn roi-group-edit-btn"
                aria-label="Rename group"
                title="Rename group"
                onClick={() => startRename(group.name)}
              >
                <ElIcon size={16}>
                  <Edit />
                </ElIcon>
              </ElButton>
              <ElButton
                class="button-reset roi-action-btn roi-group-remove-btn"
                aria-label="Remove group"
                title="Remove group"
                onClick={() => emit('remove', group.name)}
              >
                <ElIcon size={16}>
                  <Delete />
                </ElIcon>
              </ElButton>
            </div>
          </div>
        </div>
      )
    }

    const renderNewGroup = () => {
      if (!creating.value) {
        // With no groups yet the button sits centred under "No groups yet" and hugs its content
        return (
          <button
            type="button"
            class={['button-reset roi-group-new-btn', { 'is-centered': props.groups.length === 0 }]}
            onClick={() => startCreate()}
          >
            + New group
          </button>
        )
      }
      return (
        <div class="roi-group-new" onKeydown={onEnterEsc(commitCreate, cancelCreate)}>
          <div class="roi-group-line">
            <span class="roi-indicator-slot">
              {swatch(
                nextGroupChannel(
                  props.groups,
                  Object.keys(PALETTE_RGB),
                  props.rois.map((roi) => roi.channel),
                  PALETTE_RGB
                )
              )}
            </span>
            <ElInput ref={newInput} size="small" maxlength={MAX_GROUP_LABEL_LENGTH} v-model={newName.value} />
            <button type="button" class="button-reset roi-group-confirm-btn" title="Create" onClick={commitCreate}>
              &#10003;
            </button>
            <button type="button" class="button-reset roi-group-cancel-btn" title="Cancel" onClick={cancelCreate}>
              &#10005;
            </button>
          </div>
          {newError.value && <div class="roi-group-error">{newError.value}</div>}
          <div class="roi-group-hint">Enter to create · Esc to cancel</div>
        </div>
      )
    }

    const renderInfo = () => (
      <ElTooltip popperClass="roi-save-tooltip" content={UNGROUPED_HINT} placement="top" trigger={['hover', 'focus']}>
        <button type="button" class="button-reset roi-group-info" aria-label={UNGROUPED_HINT}>
          <ElIcon size={12}>
            <InfoFilled />
          </ElIcon>
        </button>
      </ElTooltip>
    )

    return () => {
      if (props.rois.length === 0) {
        return (
          <div class="roi-group-panel">
            <div class="roi-empty roi-empty-group">No ROIs to group yet. Add an ROI first.</div>
          </div>
        )
      }
      const hasGroups = props.groups.length > 0
      // With no groups the caption has nothing to collapse: its body (empty line + button) always shows
      const showGroupList = !hasGroups || !props.groupListCollapsed
      return (
        <div class="roi-group-panel">
          <div class="roi-group-assign">
            <RoiSectionHeader
              title="Assign ROIs"
              count={props.rois.length}
              collapsed={props.assignCollapsed}
              onToggle={() => emit('toggleAssign')}
            >
              {renderInfo()}
            </RoiSectionHeader>
            {!props.assignCollapsed && props.rois.map(renderAssignRow)}
          </div>
          <div class="roi-group-list">
            <RoiSectionHeader
              title="Groups"
              count={props.groups.length}
              collapsed={props.groupListCollapsed}
              collapsible={hasGroups}
              onToggle={() => emit('toggleGroupList')}
            />
            {showGroupList && props.groups.map(renderGroupRow)}
            {showGroupList && !hasGroups && <div class="roi-group-empty">No groups yet</div>}
            {showGroupList && renderNewGroup()}
          </div>
        </div>
      )
    }
  },
})
