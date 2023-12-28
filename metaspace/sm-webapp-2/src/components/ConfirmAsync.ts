import { ElMessageBox } from 'element-plus';
import reportError from '../lib/reportError';
import './ConfirmAsync.scss';


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

interface ConfirmAsyncOptions {
  confirmButtonLoadingText?: string;
  title?: string;
  message?: string;
  showInput?: boolean;
  inputPlaceholder?: string;
  inputPattern?: RegExp;
  inputErrorMessage?: string;
}

export function useConfirmAsync() {
  const confirmAsync = async (options: ConfirmAsyncOptions, action: (...args: any[]) => Promise<any>) => {
    const { confirmButtonLoadingText, ...baseOptions } = options;

    try {
      const result = await ElMessageBox.confirm(
        baseOptions.message,
        baseOptions.title,
        {
          ...baseOptions,
          showInput: baseOptions.showInput,
          inputPattern: baseOptions.inputPattern,
          inputErrorMessage: baseOptions.inputErrorMessage,
          customClass: 'confirm-async-message-box',
        }
      );

      try {
        const args = baseOptions.showInput ? [result] : [];
        await action(...args);
      } catch (err) {
        reportError(err);
      }
    } catch {
      /* User clicked cancel or closed the dialog */
    }
  };

  return confirmAsync;
}
