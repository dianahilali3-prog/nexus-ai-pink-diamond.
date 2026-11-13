import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/playfair-display/500.css';
import '@fontsource/playfair-display/500-italic.css';
import App from './App';
import './styles.css';

/** Écran de secours : une erreur d’affichage ne laisse jamais une page blanche. */
class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('NEXUS', error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fatal">
        <div className="fatal-card">
          <h1>Oups, un souci d’affichage.</h1>
          <p>Tes conversations et ta galerie sont intactes sur cet appareil.</p>
          <pre>{this.state.error.message}</pre>
          <div className="row-actions">
            <button className="primary-button" onClick={() => location.reload()}>Recharger</button>
            <button className="secondary-button" onClick={() => { location.hash = '#/home'; this.setState({ error: null }); }}>Retour à l’accueil</button>
          </div>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Boundary>
      <App />
    </Boundary>
  </React.StrictMode>
);

// Mode hors ligne & mises à jour automatiques (service worker).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  registerSW({ immediate: true });
}

// Demande au navigateur de ne pas effacer les données locales (si possible).
navigator.storage?.persist?.().catch(() => {});
