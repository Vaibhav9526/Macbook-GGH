/// <reference types="vite/client" />
import type { FlickySettings, VoiceState } from '../../../shared/types';
import logoUrl from '../../../../assets/icon.png';
import { Waveform } from '../Waveform';

interface HeroProps {
  voiceState: VoiceState;
  settings: FlickySettings;
}

export function Hero({ voiceState, settings }: HeroProps) {
  const { apiKeyStatus, mindProvider } = settings;
  // CLI providers need no key — they run as you do, off your own CLI login.
  const mindReady =
    mindProvider === 'devin-cli' || mindProvider === 'claude-cli' || mindProvider === 'opencode-cli' || mindProvider === 'copilot-cli'
      ? true
      : mindProvider === 'openai'
        ? apiKeyStatus.openai
        : apiKeyStatus.anthropic;
  const voiceReady =
    settings.ttsProvider === 'fishaudio' ? apiKeyStatus.fishaudio : apiKeyStatus.elevenlabs;
  const connectedCount = [mindReady, voiceReady, apiKeyStatus.groq].filter(
    Boolean,
  ).length;
  const ready = connectedCount === 3;

  let stateLabel: string;
  let stateClass = '';
  if (voiceState === 'listening') {
    stateLabel = 'Listening';
    stateClass = 'listening';
  } else if (voiceState === 'processing') {
    stateLabel = 'Thinking';
  } else if (voiceState === 'responding') {
    stateLabel = 'Responding';
  } else if (!ready) {
    stateLabel = `Setup · ${connectedCount} of 3`;
    stateClass = 'setup';
  } else {
    stateLabel = 'Ready';
  }

  return (
    <div className="hero">
      <div className="hero-top">
        <img className="logo" src={logoUrl} alt="SuperJargon" style={{ width: 40, height: 40 }} />
        <div>
          <div className="brand-name">SuperJargon</div>
          <div className="brand-sub">your voice companion</div>
        </div>
        <div className={`state ${stateClass}`}>{stateLabel}</div>
      </div>
      <Waveform state={ready ? voiceState : 'idle'} />
      {ready ? (
        <div className="hero-ptt">
          hold <kbd>Ctrl</kbd>
          <kbd>Alt</kbd>
          <kbd>X</kbd> to talk
        </div>
      ) : (
        <div className="hero-ptt blocked">
          {connectedCount === 2
            ? 'one more key needed to start talking'
            : `add ${3 - connectedCount} keys to start talking`}
        </div>
      )}
    </div>
  );
}
