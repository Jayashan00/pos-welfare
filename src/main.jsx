import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/public-sans/400.css';
import '@fontsource/public-sans/500.css';
import '@fontsource/public-sans/600.css';
import '@fontsource/public-sans/700.css';
import './styles.css';
import App from './App';
import { StoreProvider } from './lib/store';
import { ConfirmProvider, ToastProvider } from './components/ui';

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
