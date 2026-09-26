import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { loadMarkdown } from './components/ChatMessage';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// Warm the Markdown chunk once the first screen is up, so the first reply renders rich immediately.
const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500));
idle(() => void loadMarkdown());
