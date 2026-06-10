import { toast } from 'sonner';

/**
 * Toast-based replacement for window.confirm. Non-blocking: shows a toast with
 * a confirm action + cancel button; runs onConfirm only when the action clicked.
 */
export function confirmToast(
  message: string,
  onConfirm: () => void,
  opts?: { confirmLabel?: string; cancelLabel?: string },
) {
  toast(message, {
    action: { label: opts?.confirmLabel ?? 'Xóa', onClick: onConfirm },
    cancel: { label: opts?.cancelLabel ?? 'Hủy', onClick: () => {} },
  });
}
