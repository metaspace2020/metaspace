import { Mark } from 'tiptap'
import { toggleMark } from 'tiptap-commands'

export class Sub extends Mark {

  get name() {
    return 'sub'
  }

  get schema() {
    return {
      parseDOM: [
        {
          tag: 'sub',
        },
      ],
      toDOM: () => ['sub', 0],
    }
  }

  commands({ type }) {
    return () => toggleMark(type)
  }

}

export class Sup extends Mark {

  get name() {
    return 'sup'
  }

  get schema() {
    return {
      parseDOM: [
        {
          tag: 'sup',
        },
      ],
      toDOM: () => ['sup', 0],
    }
  }

  commands({ type }) {
    return () => toggleMark(type)
  }

}
