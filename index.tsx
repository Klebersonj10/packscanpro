
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

/**
 * Ponto de montagem principal.
 * Removido StrictMode para evitar conflitos de inicialização de sessão em PWAs.
 */
const rootElement = document.getElementById('root');

if (rootElement) {
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(<App />);
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
