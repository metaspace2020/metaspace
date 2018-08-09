import {
  ElMessageBoxComponent,
  ElMessageBoxOptions,
  MessageBoxCloseAction,
} from '../../../node_modules/element-ui/types/message-box';
import reportError from '../../lib/reportError';
import { Vue } from '../../../node_modules/vue/types/vue';

interface ExtraOptions {
  confirmButtonLoadingText?: string;
}
type ValueOrCallback<T> = T | ((...args: any[]) => T);

/**
 * Decorator for async methods that require a confirmation prompt.
 * Usage:
 * ```typescript
 * class MyComponent extends Vue {
 *   @ConfirmAsync(function (datasetId: string) {
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
 * Note that this also concats the value o
 *
 */
function ConfirmAsync(options: ValueOrCallback<ElMessageBoxOptions & ExtraOptions>) {

  return function decorate<This extends Vue, T extends (this: This, ...args: any[]) => Promise<any>>(target: This, propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<T>) {
    const originalFunc = descriptor.value as any as Function;

    async function wrappedFunc(this: This, ...args: any[]) {
      const { confirmButtonLoadingText, showInput, ...baseOptions } = typeof options === 'function'
        ? options.apply(this, args)
        : options;

      try {
        await this.$msgbox({
          showCancelButton: true,
          lockScroll: true,
          showInput,
          ...baseOptions,
          beforeClose: async (action: MessageBoxCloseAction, instance: ElMessageBoxComponent, done: Function) => {
            let originalConfirmText = instance.confirmButtonText;
            if (action === 'confirm') {
              instance.confirmButtonLoading = true;
              if (confirmButtonLoadingText != null) {
                instance.confirmButtonText = confirmButtonLoadingText;
              }
              try {
                // if showInput is used, append the input value to `args`
                const newArgs = showInput ? args.concat([instance.inputValue]) : args;
                await originalFunc.apply(this, newArgs);
                done();
              } catch (err) {
                reportError(err);
              } finally {
                // Restore instance to its previous state, because MessageBox keeps some state even after closing
                instance.confirmButtonLoading = false;
                instance.confirmButtonText = originalConfirmText;
              }
            } else {
              done();
            }
          }
        })
      } catch {
        /* User clicked cancel */
      }
    }
    return {
      ...descriptor,
      value: wrappedFunc
    }
  }
}

export default ConfirmAsync;
