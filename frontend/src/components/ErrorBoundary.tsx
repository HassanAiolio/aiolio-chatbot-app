import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clearAllLocalData } from '../lib/storage';

interface State {
  error: Error | null;
}

/** Last line of defence: a render error shows a way out instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Aiolio crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <h1>Something broke.</h1>
        <p>{this.state.error.message}</p>
        <div className="crash-actions">
          <button type="button" className="btn primary" onClick={() => location.reload()}>
            Reload
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              if (confirm('Delete all chats, memories and settings stored in this browser?')) {
                clearAllLocalData();
                location.reload();
              }
            }}
          >
            Reset local data
          </button>
        </div>
      </div>
    );
  }
}
