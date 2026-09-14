<template>
  <div>
    <el-autocomplete
      class="md-ac"
      :model-value="displayValue"
      :required="required"
      :placeholder="placeholder"
      :trigger-on-focus="true"
      :fetch-suggestions="fetchSuggestions"
      v-bind="$attrs"
      @input="onFreeTextInput"
      @select="onSelectSuggestion"
    />
    <div v-if="isPendingCuration" class="ontology-term-hint">
      Not matched to a known term - will be reviewed by a curator. You can still submit.
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType, computed } from 'vue'
import { ElAutocomplete } from '../../../lib/element-plus'
import { OntologyTermValue } from '../formStructure'

// A suggestion is either a resolved ontology term (has `curie`) or a past submitter's free-text
// value (metadataSuggestions, no `curie`) - see MetadataEditor.vue's getSuggestionsForField, which
// merges both sources for an 'ontologyTerm' field. `value` is always the display string; el-autocomplete
// shows it verbatim and hands the whole option back to @select.
type Suggestion = { value: string; curie?: string; label?: string }

export default defineComponent({
  name: 'OntologyTermInput',
  components: { ElAutocomplete },
  props: {
    value: { type: Object as PropType<OntologyTermValue | null>, default: null },
    required: { type: Boolean, default: false },
    placeholder: { type: String as PropType<string> },
    fetchSuggestions: { type: Function as any },
  },
  emits: ['input'],
  setup(props, { emit }) {
    const displayValue = computed(() => props.value?.value_label || props.value?.value_free_text || '')

    const isPendingCuration = computed(
      () => props.value?.curation_state === 'pending_curation' && !!props.value?.value_free_text
    )

    const onFreeTextInput = (text: string) => {
      // Free typing, no suggestion selected: structurally the same escape hatch as every other
      // OntologyTermValue-shaped field - never blocks, never errors, just flagged for curator review.
      emit('input', { value_free_text: text || undefined, curation_state: 'pending_curation' })
    }

    const onSelectSuggestion = (option: Suggestion) => {
      if (option.curie) {
        emit('input', {
          value_ontology_id: option.curie,
          value_label: option.label || option.value,
          curation_state: 'controlled',
        })
      } else {
        // A past-submitter free-text suggestion (metadataSuggestions), not a resolved term.
        emit('input', { value_free_text: option.value, curation_state: 'pending_curation' })
      }
    }

    return {
      displayValue,
      isPendingCuration,
      onFreeTextInput,
      onSelectSuggestion,
    }
  },
})
</script>

<style lang="scss" scoped>
.ontology-term-hint {
  @apply text-gray-500;
  font-size: 12px;
  padding: 2px 0 0 2px;
}
</style>
