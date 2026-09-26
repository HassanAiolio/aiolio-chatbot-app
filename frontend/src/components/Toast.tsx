import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

export interface ToastData {
  id: number;
  message: string;
  action?: { label: string; onClick: () => void };
}

export function useToast() {
  const [toast, setToast] = useState<ToastData | null>(null);
  const counter = useRef(0);

  const show = useCallback((message: string, action?: ToastData['action']) => {
    counter.current += 1;
    setToast({ id: counter.current, message, action });
  }, []);
  const dismiss = useCallback(() => setToast(null), []);

  return { toast, show, dismiss };
}

export function Toast({ toast, onDismiss }: { toast: ToastData | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, toast.action ? 6000 : 4000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;
  return (
    <div className="toast" role="status" key={toast.id}>
      <span>{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            toast.action?.onClick();
            onDismiss();
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" className="icon-btn small" onClick={onDismiss} aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}
