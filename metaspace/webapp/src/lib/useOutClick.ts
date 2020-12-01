import { Ref } from '@vue/composition-api'

export default (onOutClick: () => void, containerRef?: Ref<HTMLElement | undefined>) => {
  const removeListeners = () => {
    document.removeEventListener('click', clickHandler, true)
    document.removeEventListener('keyup', keyUpHandler, true)
  }

  const clickHandler = (e: MouseEvent) => {
    if (containerRef?.value?.contains(e.target as HTMLElement)) {
      return
    }
    onOutClick()
    removeListeners()
  }

  const keyUpHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onOutClick()
      removeListeners()
    }
  }

  document.addEventListener('click', clickHandler, true)
  document.addEventListener('keyup', keyUpHandler, true)

  return removeListeners
}
