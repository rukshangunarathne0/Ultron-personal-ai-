import React, { useEffect, useRef, useState } from 'react';
import { Brain, Check, Cpu, FileAudio, Play, Radio, Sparkles, Upload, Volume2, X } from 'lucide-react';
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
  onPreviewAmplitude?: (amp: number) => void;
}

export const VoiceBrainModal: React.FC<VoiceBrainModalProps> = ({
  isOpen,
  onClose,
  voiceConfig,
  onChangeVoiceConfig,
  brainConfig,
  onChangeBrainConfig,
  onTestVoice,
  onPreviewAmplitude,
}) => {
  const [tab, setTab] = useState<'voice' | 'brain'>('voice');
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [savedBanner, setSavedBanner] = useState(false);

  // MP3 Drag & Drop + Voice Cloner state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDraggingMp3, setIsDraggingMp3] = useState(false);
  const [uploadedMp3, setUploadedMp3] = useState<File | null>(null);
  const [mp3Status, setMp3Status] = useState<string>('');
  const [cloneService, setCloneService] = useState<'cartesia' | 'elevenlabs'>('cartesia');
  const [isCloning, setIsCloning] = useState(false);

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

  const handleMp3FilePicked = async (file?: File | null) => {
    if (!file) return;
    setUploadedMp3(file);
    setMp3Status(`Analyzing "${file.name}" & syncing Ultron vocalizer...`);
    try {
      const info = await ultronVoice.analyzeAndPreviewMp3({
        file,
        roboticResonance: voiceConfig.roboticResonance,
        onAmplitude: (amp) => onPreviewAmplitude?.(amp),
        onEnd: () => onPreviewAmplitude?.(0),
      });
      onChangeVoiceConfig({
        ...voiceConfig,
        provider: 'mp3_clone',
        pitch: info.suggestedPitch,
        muted: false,
      });
      setMp3Status(
        `✓ Loaded "${file.name}" (${info.durationSec}s) — playing preview with Ultron DSP & calibrated pitch (${info.suggestedPitch}). Now click CLONE THIS MP3 below so Ultron speaks every AI reply in this exact voice!`
      );
      triggerSaved();
    } catch (err) {
      setMp3Status(
        `Could not decode audio (${err instanceof Error ? err.message : 'invalid file'}). Try a standard .mp3 or .wav clip.`
      );
    }
  };

  const handleCloneMp3 = async () => {
    if (!uploadedMp3) {
      setMp3Status('Drop or select your .mp3 file above first.');
      return;
    }
    const apiKey =
      cloneService === 'cartesia'
        ? voiceConfig.cartesiaApiKey
        : voiceConfig.elevenLabsApiKey;

    setIsCloning(true);
    setMp3Status(`Cloning "${uploadedMp3.name}" via ${cloneService.toUpperCase()}...`);
    try {
      const clonedVoiceId = await ultronVoice.cloneMp3Voice({
        file: uploadedMp3,
        service: cloneService,
        apiKey,
        voiceName: `Ultron (${uploadedMp3.name.replace(/\.[^.]+$/, '')})`,
      });
      if (cloneService === 'cartesia') {
        onChangeVoiceConfig({
          ...voiceConfig,
          provider: 'mp3_clone',
          cartesiaVoiceId: clonedVoiceId,
          muted: false,
        });
      } else {
        onChangeVoiceConfig({
          ...voiceConfig,
          provider: 'mp3_clone',
          elevenLabsVoiceId: clonedVoiceId,
          muted: false,
        });
      }
      setMp3Status(
        `✓ VOICE CLONED! Voice ID [${clonedVoiceId}] locked in. Click "TEST ULTRON VOICE NOW" below to hear Ultron speak new words in your .mp3 voice!`
      );
      triggerSaved();
    } catch (err) {
      setMp3Status(`✗ ${err instanceof Error ? err.message : 'Voice clone failed'}`);
    } finally {
      setIsCloning(false);
    }
  };

  const shiftRate = voiceConfig.ultronShiftRate ?? 0.88;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="ultron-modal-glass ultron-corners w-full max-w-2xl max-h-[90vh] flex flex-col rounded-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-red-500/40">
          <div className="flex items-center gap-2.5">
            <Radio className="w-5 h-5 text-red-500" />
            <div>
              <h2 className="font-display text-sm font-bold tracking-[0.18em] text-white">
                ULTRON VOICE (.MP3 CLONER) &amp; NEURAL BRAIN CORE
              </h2>
              <p className="font-mono-tech text-[10.5px] text-red-300/85">
                Drop an .MP3 voice sample, use Groq Neural TTS, or configure your LLM brain
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
            1. DROP .MP3 / UPGRADE VOICE
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
              {/* Voice Provider Selector */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono-tech text-xs">
                {[
                  { id: 'mp3_clone', title: 'DROP .MP3 VOICE', sub: 'Upload & Clone MP3' },
                  { id: 'groq_orpheus', title: 'GROQ NEURAL TTS', sub: 'Uses Connected Key' },
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

              {/* OPTION A: DROP .MP3 VOICE UPLOADER & INSTANT CLONER */}
              {voiceConfig.provider === 'mp3_clone' && (
                <div className="p-3.5 border border-red-500/45 bg-black/50 space-y-3">
                  <div className="font-mono-tech text-xs text-amber-300 flex items-center gap-1.5">
                    <FileAudio className="w-4 h-4 text-red-400" />
                    DROP YOUR ULTRON .MP3 / .WAV SAMPLE HERE
                  </div>

                  {/* Drag-and-Drop Zone */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingMp3(true);
                    }}
                    onDragLeave={() => setIsDraggingMp3(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingMp3(false);
                      const file = e.dataTransfer.files?.[0];
                      handleMp3FilePicked(file);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`p-5 border-2 border-dashed text-center transition-all cursor-pointer ${
                      isDraggingMp3
                        ? 'border-amber-300 bg-red-600/30'
                        : 'border-red-500/55 bg-red-950/20 hover:border-red-400 hover:bg-red-950/35'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".mp3,.wav,.m4a,.ogg,audio/*"
                      className="hidden"
                      onChange={(e) => handleMp3FilePicked(e.target.files?.[0])}
                    />
                    <Upload className="w-6 h-6 text-red-400 mx-auto mb-1.5" />
                    <div className="font-mono-tech text-xs text-white font-bold">
                      {uploadedMp3
                        ? `SELECTED: ${uploadedMp3.name} (${(uploadedMp3.size / 1024).toFixed(0)} KB)`
                        : 'DRAG & DROP YOUR .MP3 VOICE CLIP HERE — OR CLICK TO BROWSE'}
                    </div>
                    <div className="text-[11px] text-red-200/80 mt-1">
                      5–20 second clean Ultron voice clip works best • Previews immediately with Ultron cheek/mouth glow
                    </div>
                  </div>

                  {mp3Status && (
                    <div className="p-2.5 border border-red-400/45 bg-red-950/35 font-mono-tech text-[11px] text-amber-200 leading-relaxed">
                      {mp3Status}
                    </div>
                  )}

                  {/* Instant Cloud Voice Cloner from the dropped MP3 */}
                  <div className="p-3 border border-red-500/30 bg-black/55 space-y-2.5">
                    <div className="font-mono-tech text-[11px] text-red-200">
                      <strong className="text-white">MAKE ULTRON SPEAK NEW WORDS IN THIS .MP3 VOICE:</strong>{' '}
                      Choose a voice-cloning engine, paste its API key, and click <strong>CLONE .MP3 NOW</strong>:
                    </div>

                    <div className="grid grid-cols-2 gap-2 font-mono-tech text-[11px]">
                      <button
                        type="button"
                        onClick={() => setCloneService('cartesia')}
                        className={`p-2 border cursor-pointer ${
                          cloneService === 'cartesia'
                            ? 'border-red-400 bg-red-600/30 text-white'
                            : 'border-red-500/30 text-red-300/80'
                        }`}
                      >
                        Cartesia Sonic (Free Tier Clones MP3s!)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCloneService('elevenlabs')}
                        className={`p-2 border cursor-pointer ${
                          cloneService === 'elevenlabs'
                            ? 'border-red-400 bg-red-600/30 text-white'
                            : 'border-red-500/30 text-red-300/80'
                        }`}
                      >
                        ElevenLabs Instant Voice Clone
                      </button>
                    </div>

                    {cloneService === 'cartesia' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block font-mono-tech text-[10px] text-red-300 mb-1">
                            Cartesia API Key (free at play.cartesia.ai):
                          </label>
                          <input
                            type="password"
                            value={voiceConfig.cartesiaApiKey || ''}
                            onChange={(e) =>
                              onChangeVoiceConfig({
                                ...voiceConfig,
                                cartesiaApiKey: e.target.value,
                              })
                            }
                            placeholder="sk_car_..."
                            className="w-full bg-black/70 border border-red-500/45 p-2 text-xs text-white font-mono-tech"
                          />
                        </div>
                        <div>
                          <label className="block font-mono-tech text-[10px] text-red-300 mb-1">
                            Cloned Voice ID (auto-filled after clone):
                          </label>
                          <input
                            type="text"
                            value={voiceConfig.cartesiaVoiceId || ''}
                            onChange={(e) =>
                              onChangeVoiceConfig({
                                ...voiceConfig,
                                cartesiaVoiceId: e.target.value,
                              })
                            }
                            placeholder="Auto-filled on clone..."
                            className="w-full bg-black/70 border border-red-500/45 p-2 text-xs text-white font-mono-tech"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block font-mono-tech text-[10px] text-red-300 mb-1">
                            ElevenLabs API Key (elevenlabs.io):
                          </label>
                          <input
                            type="password"
                            value={voiceConfig.elevenLabsApiKey}
                            onChange={(e) =>
                              onChangeVoiceConfig({
                                ...voiceConfig,
                                elevenLabsApiKey: e.target.value,
                              })
                            }
                            placeholder="sk_..."
                            className="w-full bg-black/70 border border-red-500/45 p-2 text-xs text-white font-mono-tech"
                          />
                        </div>
                        <div>
                          <label className="block font-mono-tech text-[10px] text-red-300 mb-1">
                            Cloned Voice ID (auto-filled after clone):
                          </label>
                          <input
                            type="text"
                            value={voiceConfig.elevenLabsVoiceId}
                            onChange={(e) =>
                              onChangeVoiceConfig({
                                ...voiceConfig,
                                elevenLabsVoiceId: e.target.value,
                              })
                            }
                            placeholder="nPczCjzI2devNBz1zQrb"
                            className="w-full bg-black/70 border border-red-500/45 p-2 text-xs text-white font-mono-tech"
                          />
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={isCloning}
                      onClick={handleCloneMp3}
                      className="w-full py-2 bg-red-600/50 hover:bg-red-600/75 disabled:opacity-50 border border-red-400 font-mono-tech text-xs text-white flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {isCloning ? 'CLONING YOUR .MP3 VOICE...' : '1-CLICK CLONE THIS .MP3 VOICE'}
                    </button>
                  </div>
                </div>
              )}

              {/* OPTION B: GROQ ORPHEUS NEURAL TTS (USES CONNECTED SERVER KEY!) */}
              {voiceConfig.provider === 'groq_orpheus' && (
                <div className="p-3.5 border border-red-500/35 bg-black/40 space-y-3">
                  <div className="font-mono-tech text-xs text-emerald-300">
                    ✓ GROQ ORPHEUS NEURAL VOICE (USES YOUR PRE-CONNECTED GROQ KEY!)
                  </div>
                  <p className="text-xs text-red-100/90 leading-relaxed">
                    Synthesizes neural English WAV audio via Groq&apos;s{' '}
                    <code className="text-amber-200">canopylabs/orpheus-v1-english</code> model and
                    shifts it into a deep metallic Ultron baritone.{' '}
                    <span className="text-amber-300">
                      (Note: If Groq asks once for model terms, click &ldquo;Accept&rdquo; at{' '}
                      <a
                        href="https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english"
                        target="_blank"
                        rel="noreferrer"
                        className="underline text-amber-200"
                      >
                        console.groq.com/playground?model=canopylabs/orpheus-v1-english
                      </a>
                      .)
                    </span>
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-mono-tech text-[10.5px] text-red-300 mb-1">
                        Neural Male Base Voice:
                      </label>
                      <select
                        value={voiceConfig.groqVoice || 'troy'}
                        onChange={(e) => {
                          onChangeVoiceConfig({
                            ...voiceConfig,
                            groqVoice: e.target.value as VoiceConfig['groqVoice'],
                          });
                          triggerSaved();
                        }}
                        className="w-full bg-black/70 border border-red-500/45 p-2 text-xs text-white font-mono-tech"
                      >
                        <option value="troy">troy (Deepest / Best for Ultron)</option>
                        <option value="daniel">daniel (Calm / Cold Precision)</option>
                        <option value="austin">austin (Gritty / Commanding)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-mono-tech text-[10.5px] text-red-300 mb-1">
                        Ultron Baritone Shift ({shiftRate.toFixed(2)}x — lower = deeper overlord):
                      </label>
                      <input
                        type="range"
                        min="0.78"
                        max="1.02"
                        step="0.02"
                        value={shiftRate}
                        onChange={(e) =>
                          onChangeVoiceConfig({
                            ...voiceConfig,
                            ultronShiftRate: parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-red-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Provider-Specific Controls */}
              {voiceConfig.provider === 'browser_ultron' && (
                <div className="p-3.5 border border-red-500/35 bg-black/40 space-y-3">
                  <div className="font-mono-tech text-xs text-red-300">
                    BUILT-IN BROWSER ULTRON SYNTHESIZER (READY NOW • ZERO KEYS)
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
                    ELEVENLABS (MOVIE-QUALITY ULTRON VOICE)
                  </div>
                  <ol className="list-decimal list-inside text-xs text-red-100/90 space-y-1">
                    <li>
                      Create a free account at <span className="text-amber-300">elevenlabs.io</span>{' '}
                      &rarr; click Profile &rarr; <strong>API Keys</strong> &rarr; Copy key.
                    </li>
                    <li>
                      Use deep Voice ID <code className="text-amber-200">nPczCjzI2devNBz1zQrb</code>{' '}
                      (Brian) or <code className="text-amber-200">pNInz6obpgDQGcFmaJgB</code> (Adam),
                      OR clone your <code>.mp3</code> in the <strong>DROP .MP3 VOICE</strong> tab!
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
                    OPENAI NEURAL SPEECH (&ldquo;ONYX&rdquo; DEEP MALE VOICE)
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
                    100% FREE LOCAL PC VOICE CLONE SERVER (F5-TTS / XTTS / PIPER)
                  </div>
                  <p className="text-xs text-red-100/85">
                    Want 100% offline zero-cloud voice cloning from your <code>.mp3</code>? Run{' '}
                    <strong>F5-TTS</strong> or <strong>Coqui XTTS-v2</strong> on your PC with your{' '}
                    <code>.mp3</code> as reference audio and point this URL to it:
                  </p>
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
                Pre-connected to your <strong>Groq Cloud Key (GPT-OSS 120B)</strong> with automatic
                model discovery and your exact 7-step RUK-AI System Prompt +{' '}
                <code className="text-amber-200">&lt;memory_update&gt;</code> loop.
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono-tech text-xs">
                {[
                  { id: 'autonomous_local', label: 'LOCAL CORE', sub: 'Zero-Key • Instant' },
                  { id: 'gemini', label: 'GOOGLE GEMINI', sub: 'Free Tier API Key' },
                  { id: 'groq', label: 'GROQ GPT-OSS 120B', sub: 'Connected • 500 T/s' },
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
                            ? 'openai/gpt-oss-120b'
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
                      ✓ GROQ CLOUD KEY PRE-CONNECTED ON SERVER (openai/gpt-oss-120b + auto-discovery active).
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
