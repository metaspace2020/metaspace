// Stands in for `vue3-resize-directive` during the build-time prerender.
//
// The package is a prebuilt UMD bundle that touches `window` the moment it is
// imported, which takes /annotations down with it in Node. There is nothing to
// observe resizing during a static render, so the directive becomes a no-op.
// Aliased in by the SSR branch of vite.config.mts.

import type { Directive } from 'vue'

const resize: Directive = {}

export default resize
