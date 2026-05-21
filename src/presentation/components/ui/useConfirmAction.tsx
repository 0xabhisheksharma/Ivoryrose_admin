"use client";

import { useCallback, useState } from "react";
import type { ConfirmDialogProps } from "./ConfirmDialog";

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
};

export function useConfirmAction() {
  const [state, setState] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void | Promise<void>;
  }>({
    open: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });
  const [loading, setLoading] = useState(false);

  const openConfirm = useCallback(
    (options: ConfirmOptions) => {
      setState({
        open: true,
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel,
        cancelLabel: options.cancelLabel,
        onConfirm: options.onConfirm,
      });
      setLoading(false);
    },
    []
  );

  const closeConfirm = useCallback(() => {
    if (!loading) {
      setState((s) => ({ ...s, open: false }));
    }
  }, [loading]);

  const handleConfirm = useCallback(async () => {
    setLoading(true);
    try {
      await state.onConfirm();
      setState((s) => ({ ...s, open: false }));
    } finally {
      setLoading(false);
    }
  }, [state]);

  const confirmDialogProps: ConfirmDialogProps = {
    open: state.open,
    onClose: closeConfirm,
    onConfirm: handleConfirm,
    title: state.title,
    message: state.message,
    confirmLabel: state.confirmLabel,
    cancelLabel: state.cancelLabel,
    loading,
  };

  return { openConfirm, closeConfirm, confirmDialogProps, isConfirming: loading };
}
