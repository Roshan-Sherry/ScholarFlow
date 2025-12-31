
import React from 'react';
import ReactDOM from 'react-dom/client';
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

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
