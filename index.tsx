
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import App from './App';

// Suppress benign ResizeObserver errors common with layout libraries (react-pdf, monaco)
// These errors are harmless but can crash the React dev overlay or clutter the console.
const resizeObserverLoopErr = 'ResizeObserver loop completed with undelivered notifications.';

// 1. Prevent runtime crash overlay by capturing the global error event
window.addEventListener('error', (event) => {
  const msg = event.message;
  if (
    msg === resizeObserverLoopErr ||
    msg === 'ResizeObserver loop limit exceeded' ||
    (typeof msg === 'string' && msg.includes('ResizeObserver'))
  ) {
    event.stopImmediatePropagation();
    event.preventDefault(); // Explicitly prevent default handling
  }
});

// 2. Suppress console errors to keep the log clean
const originalError = console.error;
console.error = (...args) => {
  if (
    typeof args[0] === 'string' &&
    (args[0].includes('ResizeObserver loop') || args[0].includes('ResizeObserver loop limit exceeded'))
  ) {
    return;
  }
  originalError.apply(console, args);
};

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 60000, // 1 minute
    },
  },
});

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>
);
