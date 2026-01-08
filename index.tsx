
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

/**
 * Ponto de montagem principal.
 * O polyfill de 'process' agora reside no index.html para garantir execução síncrona prévia.
 */
const rootElement = document.getElementById('root');

if (rootElement) {
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (error) {
    console.error("Falha ao montar o aplicativo:", error);
    rootElement.innerHTML = `
      <div style="padding: 20px; font-family: sans-serif; text-align: center;">
        <h2 style="color: #ef4444;">Erro de Inicialização</h2>
        <p>Verifique o console do navegador para detalhes.</p>
      </div>
    `;
  }
}
