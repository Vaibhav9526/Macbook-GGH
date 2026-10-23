import React from 'react';
import ReactDOM from 'react-dom/client';
import { PanelApp } from './components/PanelApp';
import type { FlickySettings } from '../shared/types';
import './styles/design-system.css';
import './styles/waveform.css';
import './styles/panel.css';
import './styles/onboarding.css';
import { installReadingAids } from './a11y-reading-aids';

installReadingAids();

/**
 * Appearance sliders only write to settings — the translucency itself lives
 * in panel.css, which scales each surface alpha by the matching --op-* var.
 * Pushed onto :root from here (once, at app level, not inside a tab) so the
 * glass tracks every SETTINGS_CHANGED: the General tab sliders, a tray
 * toggle, or another window writing the same store. Seeded with getSettings()
 * so the first paint isn't the default look for a frame.
 */
function applyPanelOpacity(s: FlickySettings): void {
  const root = document.documentElement;
  const c = s.panelComponentOpacity;
  root.style.setProperty('--op-master', String(s.panelOpacity));
  root.style.setProperty('--op-sidebar', String(c.sidebar));
  root.style.setProperty('--op-content', String(c.content));
  root.style.setProperty('--op-cards', String(c.cards));
  root.style.setProperty('--op-borders', String(c.borders));
}

window.flicky.getSettings().then(applyPanelOpacity);
window.flicky.onSettingsChanged(applyPanelOpacity);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PanelApp />
  </React.StrictMode>,
);
