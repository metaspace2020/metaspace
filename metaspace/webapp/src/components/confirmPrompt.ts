import {
  ElMessageBoxComponent,
  ElMessageBoxOptions,
  MessageBoxCloseAction,
} from 'element-ui/types/message-box'
import { MessageBox } from '../lib/element-ui'
import reportError from '../lib/reportError'
import './ConfirmAsync.scss'

interface ExtraOptions {
  confirmButtonLoadingText?: string;
  style?: 'warning' | 'danger';
}
type ValueOrCallback<T> = T | ((...args: any[]) => T);

const createCustomClass = (options: ExtraOptions) => {
  let customClass = 'confirm-async-message-box'
  if (options.style) {
    customClass += ` sm-dialog sm-dialog--${options.style}`
  }
  return customClass
}

/**
 * same as @ConfirmAsync without the decorator API
 */
async function confirmPrompt(options: ElMessageBoxOptions & ExtraOptions, callback: Function) {
  const { confirmButtonLoadingText, showInput, ...baseOptions } = options
  try {
    await MessageBox({
      showCancelButton: true,
      lockScroll: false,
      showInput,
      ...baseOptions,
      customClass: createCustomClass(options),
      beforeClose: async(action: MessageBoxCloseAction, instance: ElMessageBoxComponent, done: Function) => {
        const originalConfirmText = instance.confirmButtonText
        if (action === 'confirm') {
          instance.confirmButtonLoading = true
          if (confirmButtonLoadingText != null) {
            instance.confirmButtonText = confirmButtonLoadingText
          }
          try {
            // if showInput is used, pass the input value to callback
            await callback(showInput ? instance.inputValue : undefined)
          } catch (err) {
            reportError(err)
          } finally {
            // Restore instance to its previous state, because MessageBox keeps some state even after closing
            instance.confirmButtonLoading = false
            instance.confirmButtonText = originalConfirmText
            done()
          }
        } else {
          done()
        }
      },
    })
  } catch {
    /* User clicked cancel */
  }
}

export default confirmPrompt
