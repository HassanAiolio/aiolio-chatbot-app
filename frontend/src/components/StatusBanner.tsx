import { LoaderCircle, RotateCcw, TriangleAlert } from 'lucide-react';
import type { ServerStatus } from '../hooks/useServerStatus';

export function StatusBanner({ status, onRetry }: { status: ServerStatus; onRetry: () => void }) {
  if (status === 'waking') {
    return (
      <div className="status-banner" role="status">
        <LoaderCircle size={16} className="spin" />
        <span>
          Waking up the server. It runs on free hosting that sleeps when idle, so the first visit can take up to a minute.
        </span>
      </div>
    );
  }
  if (status === 'offline') {
    return (
      <div className="status-banner error" role="alert">
        <TriangleAlert size={16} />
        <span>The server isn't responding.</span>
        <button type="button" className="btn small" onClick={onRetry}>
          <RotateCcw size={14} /> Try again
        </button>
      </div>
    );
  }
  return null;
}
