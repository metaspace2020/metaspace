// Import necessary functionalities from TiPTaP v2
import { Mark, Extension } from '@tiptap/core'
import { toggleMark } from 'tiptap-commands'

export class Sub extends Mark {
  static get name() {
    return 'sub'
  }

  parseHTML() {
    return [
      { tag: 'sub' },
    ]
  }

  renderHTML({ HTMLAttributes }) {
    return ['sub', HTMLAttributes, 0]
  }

  addCommands() {
    return {
      toggleSub: () => toggleMark(this.name)
    }
  }
}

export class Sup extends Mark {
  static get name() {
    return 'sup'
  }

  parseHTML() {
    return [
      { tag: 'sup' },
    ]
  }

  renderHTML({ HTMLAttributes }) {
    return ['sup', HTMLAttributes, 0]
  }

  addCommands() {
    return {
      toggleSup: () => toggleMark(this.name)
    }
  }
}

export class OnEscape extends Extension {
  constructor(cb) {
    super()
    this.cb = cb
  }

  addKeyboardShortcuts() {
    return {
      'Escape': () => this.cb()
    }
  }
}
