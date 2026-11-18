import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/public-sans/400.css';
import '@fontsource/public-sans/500.css';
import '@fontsource/public-sans/600.css';
import '@fontsource/public-sans/700.css';
import '@fontsource/noto-sans-sinhala/400.css';
import '@fontsource/noto-sans-sinhala/600.css';
import '@fontsource/noto-sans-sinhala/700.css';
import './styles.css';
import App from './App';
import { StoreProvider } from './lib/store';
import { ConfirmProvider, ToastProvider, installAsciiInputs } from './components/ui';

installAsciiInputs();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <StoreProvider>
      <ToastProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </ToastProvider>
    </StoreProvider>
  </React.StrictMode>
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
