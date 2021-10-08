import {
  ElMessageBoxComponent,
  ElMessageBoxOptions,
  MessageBoxCloseAction,
} from 'element-ui/types/message-box'
import reportError from '../lib/reportError'
import Vue from 'vue'
import './ConfirmAsync.scss'

interface ExtraOptions {
  confirmButtonLoadingText?: string;
}
type ValueOrCallback<T> = T | ((...args: any[]) => T);

/**
 * Decorator that prompts the user with a dialog, only calls the wrapped function if the user confirms,
 * and keeps the dialog open, showing a loading spinner, while the wrapped function executes.
 *
 * Note that if `showInput` is set in the options, this also concats the value of the input to the arguments passed to
 * the wrapped function.
 *
 * This doesn't currently provide any mechanism for returning a value from the wrapped function, as it doesn't
 * make sense with the built-in error handling. Possibly the error handling should be moved into another decorator?
 *
 * Usage:
 * ```typescript
 * class MyComponent extends Vue {
 *   @ConfirmAsync(function (this: MyComponent, datasetId: string) {
 *     return {
 *       title: 'Confirm deletion',
 *       confirmButtonLoadingText: 'Deleting...',
 *       message: `Are you sure you want to delete ${this.getDatasetName(datasetId)}?`
 *     }
 *   })
 *   async deleteDataset(datasetId: string) {
 *     return await api.deleteDataset(datasetId);
 *   }
 * }
 *
 *
 */
function ConfirmAsync(options: ValueOrCallback<ElMessageBoxOptions & ExtraOptions>) {
  return function decorate<This extends Vue, T extends(this: This, ...args: any[])
    => Promise<any>>(target: This, propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<T>) {
    const originalFunc = descriptor.value as any as Function

    async function wrappedFunc(this: This, ...args: any[]) {
      const { confirmButtonLoadingText, showInput, ...baseOptions } = typeof options === 'function'
        ? options.apply(this, args)
        : options

      try {
        await this.$msgbox({
          showCancelButton: true,
          lockScroll: false,
          showInput,
          customClass: 'confirm-async-message-box',
          ...baseOptions,
          beforeClose: async(action: MessageBoxCloseAction, instance: ElMessageBoxComponent, done: Function) => {
            const originalConfirmText = instance.confirmButtonText
            if (action === 'confirm') {
              instance.confirmButtonLoading = true
              if (confirmButtonLoadingText != null) {
                instance.confirmButtonText = confirmButtonLoadingText
              }
              try {
                // if showInput is used, append the input value to `args`
                const newArgs = showInput ? args.concat([instance.inputValue]) : args
                await originalFunc.apply(this, newArgs)
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
    return {
      ...descriptor,
      value: wrappedFunc,
    }
  }
}

export default ConfirmAsync
