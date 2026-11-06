import React, { useEffect, useState } from 'react';
import { Brain, Check, Cpu, Play, Radio, Volume2, X } from 'lucide-react';
import { BrainConfig, BrainProvider, VoiceConfig, VoiceProvider } from '../types';
import { ultronVoice } from '../lib/voiceEngine';

interface VoiceBrainModalProps {
  isOpen: boolean;
  onClose: () => void;
  voiceConfig: VoiceConfig;
  onChangeVoiceConfig: (next: VoiceConfig) => void;
  brainConfig: BrainConfig;
  onChangeBrainConfig: (next: BrainConfig) => void;
  onTestVoice: () => void;
}

export const VoiceBrainModal: React.FC<VoiceBrainModalProps> = ({
  isOpen,
  onClose,
  voiceConfig,
  onChangeVoiceConfig,
  brainConfig,
  onChangeBrainConfig,
  onTestVoice,
}) => {
  const [tab, setTab] = useState<'voice' | 'brain'>('voice');
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [savedBanner, setSavedBanner] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const loadVoices = () => {
      setBrowserVoices(ultronVoice.getAvailableBrowserVoices());
    };
    loadVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const triggerSaved = () => {
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="ultron-modal-glass ultron-corners w-full max-w-2xl max-h-[88vh] flex flex-col rounded-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-red-500/40">
          <div className="flex items-center gap-2.5">
            <Radio className="w-5 h-5 text-red-500" />
            <div>
              <h2 className="font-display text-sm font-bold tracking-[0.18em] text-white">
                ULTRON VOICE &amp; NEURAL BRAIN CORE
              </h2>
              <p className="font-mono-tech text-[10.5px] text-red-300/85">
                Configure how RUK-AI speaks back to you &amp; which LLM powers cognition
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 border border-red-500/40 hover:bg-red-600/30 text-red-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="grid grid-cols-2 border-b border-red-500/35 font-mono-tech text-xs">
          <button
            type="button"
            onClick={() => setTab('voice')}
            className={`py-2.5 flex items-center justify-center gap-2 border-r border-red-500/30 cursor-pointer ${
              tab === 'voice' ? 'bg-red-600/30 text-white font-bold' : 'text-red-300/75'
            }`}
          >
            <Volume2 className="w-4 h-4 text-red-400" />
            1. ADD / UPGRADE ULTRON VOICE
          </button>
          <button
            type="button"
            onClick={() => setTab('brain')}
            className={`py-2.5 flex items-center justify-center gap-2 cursor-pointer ${
              tab === 'brain' ? 'bg-red-600/30 text-white font-bold' : 'text-red-300/75'
            }`}
          >
            <Brain className="w-4 h-4 text-red-400" />
            2. CONNECT AI BRAIN (LLM KEY)
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto ultron-scroll p-5 space-y-4">
          {tab === 'voice' ? (
            <>
              <div className="p-3 border border-red-500/40 bg-red-950/25 text-xs text-red-100 leading-relaxed">
                <strong className="text-amber-300 font-mono-tech">
                  HOW ULTRON TALKS BACK TO YOU:
                </strong>{' '}
                Every reply automatically plays through the selected voice engine below and drives
                Ultron&apos;s central vocalizer slit &amp; cheek furnaces at 60fps. Pick your
                preferred voice engine:
              </div>

              {/* Voice Provider Selector */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono-tech text-xs">
                {[
                  { id: 'browser_ultron', title: 'BUILT-IN SYNTH', sub: 'Free • Instant' },
                  { id: 'elevenlabs', title: 'ELEVENLABS', sub: 'Movie Realism' },
                  { id: 'openai_tts', title: 'OPENAI ONYX', sub: 'Deep AI Voice' },
                  { id: 'custom_endpoint', title: 'LOCAL PIPER', sub: '100% Offline PC' },
                ].map((item) => {
                  const sel = voiceConfig.provider === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onChangeVoiceConfig({
                          ...voiceConfig,
                          provider: item.id as VoiceProvider,
                          muted: false,
                        });
                        triggerSaved();
                      }}
                      className={`p-2.5 border text-left transition-all cursor-pointer ${
                        sel
                          ? 'border-red-400 bg-red-600/30 text-white shadow-[0_0_15px_rgba(255,20,48,0.3)]'
                          : 'border-red-500/30 bg-black/40 text-red-200/80 hover:border-red-400/70'
                      }`}
                    >
                      <div className="font-bold">{item.title}</div>
                      <div className="text-[10px] text-red-300/80">{item.sub}</div>
                    </button>
                  );
                })}
              </div>

              {/* Provider-Specific Controls */}
              {voiceConfig.provider === 'browser_ultron' && (
                <div className="p-3.5 border border-red-500/35 bg-black/40 space-y-3">
                  <div className="font-mono-tech text-xs text-red-300">
                    OPTION 1: BUILT-IN BROWSER ULTRON SYNTHESIZER (READY NOW)
                  </div>
                  <div>
                    <label className="block font-mono-tech text-[11px] text-red-300/80 mb-1">
                      System Voice (Tip: Choose &ldquo;Google UK English Male&rdquo; or &ldquo;Microsoft Ryan/Guy&rdquo;):
                    </label>
                    <select
                      value={voiceConfig.browserVoiceURI}
                      onChange={(e) => {
                        onChangeVoiceConfig({ ...voiceConfig, browserVoiceURI: e.target.value });
                        triggerSaved();
                      }}
                      className="w-full bg-black/70 border border-red-500/45 p-2 text-xs text-red-100 font-mono-tech"
                    >
                      <option value="">Auto-Select Deepest Male English Voice</option>
                      {browserVoices.map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI}>
                          {v.name} ({v.lang})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-mono-tech text-[11px] text-red-300/80 mb-1">
                        Ultron Pitch ({voiceConfig.pitch.toFixed(2)} — lower = deeper/scarier):
                      </label>
                      <input
                        type="range"
                        min="0.35"
                        max="1.2"
                        step="0.03"
                        value={voiceConfig.pitch}
                        onChange={(e) =>
                          onChangeVoiceConfig({
                            ...voiceConfig,
                            pitch: parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-red-500"
                      />
                    </div>
                    <div>
                      <label className="block font-mono-tech text-[11px] text-red-300/80 mb-1">
                        Cadence Rate ({voiceConfig.rate.toFixed(2)}):
                      </label>
                      <input
                        type="range"
                        min="0.75"
                        max="1.25"
                        step="0.03"
                        value={voiceConfig.rate}
                        onChange={(e) =>
                          onChangeVoiceConfig({
                            ...voiceConfig,
                            rate: parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-red-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {voiceConfig.provider === 'elevenlabs' && (
                <div className="p-3.5 border border-red-500/35 bg-black/40 space-y-3">
                  <div className="font-mono-tech text-xs text-amber-300">
                    OPTION 2: ELEVENLABS (BEST MOVIE-QUALITY ULTRON VOICE)
                  </div>
                  <ol className="list-decimal list-inside text-xs text-red-100/90 space-y-1">
                    <li>
                      Create a free account at <span className="text-amber-300">elevenlabs.io</span>{' '}
                      &rarr; click Profile &rarr; <strong>API Keys</strong> &rarr; Copy key.
                    </li>
                    <li>
                      Use deep Voice ID <code className="text-amber-200">nPczCjzI2devNBz1zQrb</code>{' '}
                      (Brian) or <code className="text-amber-200">pNInz6obpgDQGcFmaJgB</code> (Adam),
                      OR open <strong>Voice Design</strong> and type:{' '}
                      <em>
                        &ldquo;Deep, calm, menacing metallic AI overlord with deliberate cadence&rdquo;
                      </em>{' '}
                      and paste that Voice ID below!
                    </li>
                  </ol>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-mono-tech text-[10.5px] text-red-300 mb-1">
                        ElevenLabs API Key (xi-api-key):
                      </label>
                      <input
                        type="password"
                        value={voiceConfig.elevenLabsApiKey}
                        onChange={(e) => {
                          onChangeVoiceConfig({
                            ...voiceConfig,
                            elevenLabsApiKey: e.target.value,
                          });
                          triggerSaved();
                        }}
                        placeholder="sk_..."
                        className="w-full bg-black/65 border border-red-500/45 p-2 text-xs text-white font-mono-tech"
                      />
                    </div>
                    <div>
                      <label className="block font-mono-tech text-[10.5px] text-red-300 mb-1">
                        ElevenLabs Voice ID:
                      </label>
                      <input
                        type="text"
                        value={voiceConfig.elevenLabsVoiceId}
                        onChange={(e) => {
                          onChangeVoiceConfig({
                            ...voiceConfig,
                            elevenLabsVoiceId: e.target.value,
                          });
                          triggerSaved();
                        }}
                        placeholder="nPczCjzI2devNBz1zQrb"
                        className="w-full bg-black/65 border border-red-500/45 p-2 text-xs text-white font-mono-tech"
                      />
                    </div>
                  </div>
                </div>
              )}

              {voiceConfig.provider === 'openai_tts' && (
                <div className="p-3.5 border border-red-500/35 bg-black/40 space-y-3">
                  <div className="font-mono-tech text-xs text-amber-300">
                    OPTION 3: OPENAI NEURAL SPEECH (&ldquo;ONYX&rdquo; DEEP MALE VOICE)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-mono-tech text-[10.5px] text-red-300 mb-1">
                        OpenAI API Key:
                      </label>
                      <input
                        type="password"
                        value={voiceConfig.openAiApiKey}
                        onChange={(e) => {
                          onChangeVoiceConfig({ ...voiceConfig, openAiApiKey: e.target.value });
                          triggerSaved();
                        }}
                        placeholder="sk-..."
                        className="w-full bg-black/65 border border-red-500/45 p-2 text-xs text-white font-mono-tech"
                      />
                    </div>
                    <div>
                      <label className="block font-mono-tech text-[10.5px] text-red-300 mb-1">
                        Voice Preset:
                      </label>
                      <select
                        value={voiceConfig.openAiVoice}
                        onChange={(e) =>
                          onChangeVoiceConfig({
                            ...voiceConfig,
                            openAiVoice: e.target.value as VoiceConfig['openAiVoice'],
                          })
                        }
                        className="w-full bg-black/65 border border-red-500/45 p-2 text-xs text-white font-mono-tech"
                      >
                        <option value="onyx">onyx (Deepest / Best for Ultron)</option>
                        <option value="ash">ash (Gritty / Commanding)</option>
                        <option value="echo">echo (Calm / Analytic)</option>
                        <option value="fable">fable (British Cadence)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {voiceConfig.provider === 'custom_endpoint' && (
                <div className="p-3.5 border border-red-500/35 bg-black/40 space-y-2.5">
                  <div className="font-mono-tech text-xs text-amber-300">
                    OPTION 4: 100% FREE LOCAL PC VOICE SERVER (PIPER / KOKORO / XTTS)
                  </div>
                  <p className="text-xs text-red-100/85">
                    When running on your PC, start Piper or Kokoro returning WAV/MP3 bytes from a{' '}
                    <code className="text-amber-200">POST &#123;&quot;text&quot;: &quot;...&quot;&#125;</code>{' '}
                    endpoint:
                  </p>
                  <pre className="p-2 bg-black/75 border border-red-500/30 font-mono-tech text-[10.5px] text-red-200 overflow-x-auto">
                    pip install piper-tts flask flask-cors{'\n'}# Point endpoint below to http://localhost:5002/api/tts
                  </pre>
                  <input
                    type="text"
                    value={voiceConfig.customEndpointUrl}
                    onChange={(e) => {
                      onChangeVoiceConfig({ ...voiceConfig, customEndpointUrl: e.target.value });
                      triggerSaved();
                    }}
                    placeholder="http://localhost:5002/api/tts"
                    className="w-full bg-black/65 border border-red-500/45 p-2 text-xs text-white font-mono-tech"
                  />
                </div>
              )}

              {/* Vibranium Chest Resonance Toggle + Live Test Button */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-red-500/30">
                <label className="flex items-center gap-2 text-xs text-red-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={voiceConfig.roboticResonance}
                    onChange={(e) => {
                      onChangeVoiceConfig({
                        ...voiceConfig,
                        roboticResonance: e.target.checked,
                      });
                      triggerSaved();
                    }}
                    className="accent-red-500"
                  />
                  <span>Enable Vibranium Sub-Bass &amp; Metallic Chamber Resonance (DSP)</span>
                </label>

                <button
                  type="button"
                  onClick={onTestVoice}
                  className="px-4 py-2 bg-red-600/45 hover:bg-red-600/70 border border-red-400 font-mono-tech text-xs text-white flex items-center gap-2 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  TEST ULTRON VOICE NOW
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-3.5">
              <div className="p-3 border border-red-500/40 bg-red-950/25 text-xs text-red-100 leading-relaxed">
                <strong className="text-amber-300 font-mono-tech">RUK-AI COGNITION ENGINE:</strong>{' '}
                Works immediately out-of-the-box with the built-in{' '}
                <strong>Autonomous Local Core</strong>. To unlock full LLM coding, reasoning, and
                unlimited conversation using your exact RUK-AI System Prompt +{' '}
                <code className="text-amber-200">&lt;memory_update&gt;</code> loop, select{' '}
                <strong>Gemini</strong> (free key at aistudio.google.com) or <strong>Groq</strong>{' '}
                (free key at console.groq.com)!
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono-tech text-xs">
                {[
                  { id: 'autonomous_local', label: 'LOCAL CORE', sub: 'Zero-Key • Instant' },
                  { id: 'gemini', label: 'GOOGLE GEMINI', sub: 'Free Tier API Key' },
                  { id: 'groq', label: 'GROQ LLAMA-3.3', sub: 'Free • Ultra-Fast' },
                  { id: 'openai', label: 'OPENAI GPT-4o', sub: 'Cloud API' },
                  { id: 'openrouter', label: 'OPENROUTER', sub: 'Any Model' },
                  { id: 'ollama', label: 'LOCAL OLLAMA', sub: 'Offline PC LLM' },
                ].map((b) => {
                  const sel = brainConfig.provider === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        const defaultModel =
                          b.id === 'gemini'
                            ? 'gemini-2.5-flash'
                            : b.id === 'groq'
                            ? 'llama-3.3-70b-versatile'
                            : b.id === 'openai'
                            ? 'gpt-4o-mini'
                            : b.id === 'openrouter'
                            ? 'meta-llama/llama-3.3-70b-instruct'
                            : b.id === 'ollama'
                            ? 'llama3.2'
                            : 'ruk-local-v1';
                        onChangeBrainConfig({
                          ...brainConfig,
                          provider: b.id as BrainProvider,
                          model: defaultModel,
                        });
                        triggerSaved();
                      }}
                      className={`p-2.5 border text-left cursor-pointer ${
                        sel
                          ? 'border-red-400 bg-red-600/30 text-white'
                          : 'border-red-500/30 bg-black/40 text-red-200/80 hover:border-red-400/70'
                      }`}
                    >
                      <div className="font-bold flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-red-400" />
                        {b.label}
                      </div>
                      <div className="text-[10px] text-red-300/80">{b.sub}</div>
                    </button>
                  );
                })}
              </div>

              {brainConfig.provider !== 'autonomous_local' && brainConfig.provider !== 'ollama' && (
                <div className="p-3.5 border border-red-500/35 bg-black/40 space-y-2.5">
                  {brainConfig.provider === 'groq' && !brainConfig.apiKey.trim() && (
                    <div className="p-2 border border-emerald-500/45 bg-emerald-950/30 font-mono-tech text-[11px] text-emerald-300">
                      ✓ GROQ CLOUD KEY PRE-CONNECTED ON SERVER (llama-3.3-70b-versatile active).
                      Leave blank to use your connected server key, or paste another key below to override.
                    </div>
                  )}
                  <div>
                    <label className="block font-mono-tech text-[11px] text-red-300 mb-1">
                      {brainConfig.provider.toUpperCase()} API Key{' '}
                      {brainConfig.provider === 'groq'
                        ? '(optional override — server key already active):'
                        : '(stored locally in your browser):'}
                    </label>
                    <input
                      type="password"
                      value={brainConfig.apiKey}
                      onChange={(e) => {
                        onChangeBrainConfig({ ...brainConfig, apiKey: e.target.value });
                        triggerSaved();
                      }}
                      placeholder="Paste API key here..."
                      className="w-full bg-black/65 border border-red-500/45 p-2 text-xs text-white font-mono-tech"
                    />
                  </div>
                  <div>
                    <label className="block font-mono-tech text-[11px] text-red-300 mb-1">
                      Model Name:
                    </label>
                    <input
                      type="text"
                      value={brainConfig.model}
                      onChange={(e) => {
                        onChangeBrainConfig({ ...brainConfig, model: e.target.value });
                        triggerSaved();
                      }}
                      className="w-full bg-black/65 border border-red-500/45 p-2 text-xs text-white font-mono-tech"
                    />
                  </div>
                </div>
              )}

              {brainConfig.provider === 'ollama' && (
                <div className="p-3.5 border border-red-500/35 bg-black/40 space-y-2.5">
                  <label className="block font-mono-tech text-[11px] text-red-300">
                    Ollama Base URL (run <code>OLLAMA_ORIGINS=&quot;*&quot; ollama serve</code>):
                  </label>
                  <input
                    type="text"
                    value={brainConfig.ollamaUrl}
                    onChange={(e) =>
                      onChangeBrainConfig({ ...brainConfig, ollamaUrl: e.target.value })
                    }
                    className="w-full bg-black/65 border border-red-500/45 p-2 text-xs text-white font-mono-tech"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-red-500/35 flex items-center justify-between bg-black/40">
          <div className="font-mono-tech text-xs text-emerald-400 flex items-center gap-1.5">
            {savedBanner && (
              <>
                <Check className="w-3.5 h-3.5" />
                CONFIGURATION LOCKED
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 bg-red-600/40 hover:bg-red-600/65 border border-red-400 font-mono-tech text-xs text-white tracking-wider cursor-pointer"
          >
            RETURN TO COMMAND HUD
          </button>
        </div>
      </div>
    </div>
  );
};
