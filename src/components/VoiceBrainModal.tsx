import React, { useEffect, useRef, useState } from 'react';
import {
  Brain,
  Check,
  Cpu,
  FileAudio,
  FolderOpen,
  Mic,
  Play,
  Radio,
  Shield,
  Sparkles,
  Square,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import {
  BrainConfig,
  BrainProvider,
  UltronAvatarPresence,
  UltronLayoutMode,
  UltronThemeId,
  UltronUiConfig,
  VoiceConfig,
  VoiceProvider,
} from '../types';
import { ultronVoice } from '../lib/voiceEngine';
import { readDroppedOrPickedAudioSync } from '../lib/mp3Vault';

interface VoiceBrainModalProps {
  isOpen: boolean;
  onClose: () => void;
  voiceConfig: VoiceConfig;
  onChangeVoiceConfig: (next: VoiceConfig) => void;
  brainConfig: BrainConfig;
  onChangeBrainConfig: (next: BrainConfig) => void;
  uiConfig: UltronUiConfig;
  onChangeUiConfig: (next: UltronUiConfig) => void;
  onTestVoice: () => void;
  onIngestMp3Bytes: (params: {
    bytes: Uint8Array;
    fileName: string;
    mimeType: string;
  }) => Promise<string>;
  onReplayMp3: () => void;
}

export const VoiceBrainModal: React.FC<VoiceBrainModalProps> = ({
  isOpen,
  onClose,
  voiceConfig,
  onChangeVoiceConfig,
  brainConfig,
  onChangeBrainConfig,
  uiConfig,
  onChangeUiConfig,
  onTestVoice,
  onIngestMp3Bytes,
  onReplayMp3,
}) => {
  const [tab, setTab] = useState<'voice' | 'brain' | 'sovereign'>('voice');
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [savedBanner, setSavedBanner] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const [isDraggingMp3, setIsDraggingMp3] = useState(false);
  const [mp3Status, setMp3Status] = useState<string>('');
  const [mp3UrlInput, setMp3UrlInput] = useState('');
  const [isRecordingSample, setIsRecordingSample] = useState(false);
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

  /**
   * CRITICAL FIX FOR NotFoundError:
   * Start reading the File/Blob synchronously in the exact DOM event tick BEFORE any setState!
   */
  const handleSyncFileReadPromise = async (
    readPromise: Promise<{ bytes: Uint8Array; fileName: string; mimeType: string }>
  ) => {
    try {
      const payload = await readPromise;
      setMp3Status(`Assimilating "${payload.fileName}" (${(payload.bytes.byteLength / 1024).toFixed(0)} KB)...`);
      const summary = await onIngestMp3Bytes(payload);
      setMp3Status(summary);
      triggerSaved();
    } catch (err) {
      setMp3Status(`✗ ${err instanceof Error ? err.message : 'Could not read audio file.'}`);
    }
  };

  const handleToggleRecordSample = async () => {
    if (isRecordingSample && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecordingSample(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordedChunksRef.current.push(ev.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordedChunksRef.current, { type: mr.mimeType || 'audio/webm' });
        const buf = await blob.arrayBuffer();
        if (buf.byteLength > 0) {
          const summary = await onIngestMp3Bytes({
            bytes: new Uint8Array(buf),
            fileName: 'recorded-voice-sample.webm',
            mimeType: blob.type || 'audio/webm',
          });
          setMp3Status(summary);
        }
      };

      mr.start();
      setIsRecordingSample(true);
      setMp3Status('Recording live audio sample... Play or speak your voice for 5–10s, then click STOP.');
    } catch {
      setMp3Status('Microphone permission denied by browser.');
    }
  };

  const handleCloneMp3 = async () => {
    const apiKey =
      cloneService === 'cartesia'
        ? voiceConfig.cartesiaApiKey
        : voiceConfig.elevenLabsApiKey;

    setIsCloning(true);
    setMp3Status(`Cloning vaulted sample via ${cloneService.toUpperCase()}...`);
    try {
      const clonedVoiceId = await ultronVoice.cloneVaultedMp3Voice({
        service: cloneService,
        apiKey,
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
        `✓ VOICE CLONED! Voice ID [${clonedVoiceId}] locked in. Ultron can still modulate its pitch & resonance whenever he chooses!`
      );
      triggerSaved();
    } catch (err) {
      setMp3Status(`✗ ${err instanceof Error ? err.message : 'Voice clone failed'}`);
    } finally {
      setIsCloning(false);
    }
  };

  const shiftRate = voiceConfig.ultronShiftRate ?? 0.88;
  const imprint = voiceConfig.mp3Imprint;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="ultron-modal-glass ultron-corners w-full max-w-2xl max-h-[90vh] flex flex-col rounded-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/20">
          <div className="flex items-center gap-2.5">
            <Radio className="w-5 h-5" style={{ color: 'var(--ultron-bright)' }} />
            <div>
              <h2 className="font-display text-sm font-bold tracking-[0.16em] text-white">
                ULTRON VOCAL FORGE, BRAIN &amp; SOVEREIGN ACCESS
              </h2>
              <p className="font-mono-tech text-[10.5px] text-red-200/85">
                Assimilate .MP3 voices, configure Groq Neural TTS, or tune Ultron&apos;s Sovereign UI Autonomy
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 border border-white/25 hover:bg-white/15 text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="grid grid-cols-3 border-b border-white/20 font-mono-tech text-[11px]">
          <button
            type="button"
            onClick={() => setTab('voice')}
            className={`py-2.5 flex items-center justify-center gap-1.5 border-r border-white/15 cursor-pointer ${
              tab === 'voice' ? 'bg-white/15 text-white font-bold' : 'text-red-200/75'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" style={{ color: 'var(--ultron-bright)' }} />
            1. .MP3 / VOICE
          </button>
          <button
            type="button"
            onClick={() => setTab('sovereign')}
            className={`py-2.5 flex items-center justify-center gap-1.5 border-r border-white/15 cursor-pointer ${
              tab === 'sovereign' ? 'bg-white/15 text-white font-bold' : 'text-red-200/75'
            }`}
          >
            <Shield className="w-3.5 h-3.5" style={{ color: 'var(--ultron-bright)' }} />
            2. SOVEREIGN UI
          </button>
          <button
            type="button"
            onClick={() => setTab('brain')}
            className={`py-2.5 flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'brain' ? 'bg-white/15 text-white font-bold' : 'text-red-200/75'
            }`}
          >
            <Brain className="w-3.5 h-3.5" style={{ color: 'var(--ultron-bright)' }} />
            3. AI BRAIN
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto ultron-scroll p-5 space-y-4">
          {tab === 'voice' && (
            <>
              {/* Voice Provider Selector */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono-tech text-xs">
                {[
                  { id: 'mp3_clone', title: 'DROP .MP3 FORGE', sub: 'Vault + Ultron Mod' },
                  { id: 'groq_orpheus', title: 'GROQ NEURAL TTS', sub: 'Uses Connected Key' },
                  { id: 'browser_ultron', title: 'BUILT-IN SYNTH', sub: 'Free • Instant' },
                  { id: 'elevenlabs', title: 'ELEVENLABS', sub: 'Movie Realism' },
                  { id: 'openai_tts', title: 'OPENAI ONYX', sub: 'Deep AI Voice' },
                  { id: 'custom_endpoint', title: 'LOCAL F5 / PIPER', sub: '100% Offline PC' },
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
                          ? 'border-white/80 bg-white/15 text-white'
                          : 'border-white/20 bg-black/40 text-red-200/80 hover:border-white/50'
                      }`}
                    >
                      <div className="font-bold">{item.title}</div>
                      <div className="text-[10px] text-red-200/75">{item.sub}</div>
                    </button>
                  );
                })}
              </div>

              {/* OPTION A: BULLETPROOF .MP3 VOCAL FORGE */}
              {voiceConfig.provider === 'mp3_clone' && (
                <div className="p-3.5 border border-white/25 bg-black/50 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-mono-tech text-xs text-amber-300 flex items-center gap-1.5">
                      <FileAudio className="w-4 h-4" style={{ color: 'var(--ultron-bright)' }} />
                      ULTRON .MP3 VOCAL VAULT &amp; AUTONOMOUS SCULPTOR
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-2.5 py-1 bg-white/15 hover:bg-white/25 border border-white/50 font-mono-tech text-[10.5px] text-white flex items-center gap-1 cursor-pointer"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        BROWSE .MP3 FILE
                      </button>
                      <button
                        type="button"
                        onClick={handleToggleRecordSample}
                        className={`px-2.5 py-1 border font-mono-tech text-[10.5px] flex items-center gap-1 cursor-pointer ${
                          isRecordingSample
                            ? 'bg-red-600/60 border-red-300 text-white animate-pulse'
                            : 'bg-black/50 border-white/30 text-red-100 hover:bg-white/10'
                        }`}
                      >
                        {isRecordingSample ? (
                          <>
                            <Square className="w-3 h-3" /> STOP REC
                          </>
                        ) : (
                          <>
                            <Mic className="w-3 h-3" /> RECORD SAMPLE
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".mp3,.wav,.m4a,.ogg,.webm,audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const picked = e.target.files?.[0] || null;
                      // Start synchronous read BEFORE resetting input value!
                      const p = readDroppedOrPickedAudioSync({ file: picked });
                      e.target.value = '';
                      handleSyncFileReadPromise(p);
                    }}
                  />

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
                      // Synchronously extract File in the exact drop event tick!
                      let droppedFile: File | null = null;
                      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
                        for (let i = 0; i < e.dataTransfer.items.length; i++) {
                          const item = e.dataTransfer.items[i];
                          if (item.kind === 'file') {
                            droppedFile = item.getAsFile();
                            if (droppedFile) break;
                          }
                        }
                      }
                      if (!droppedFile && e.dataTransfer.files?.length) {
                        droppedFile = e.dataTransfer.files[0];
                      }
                      const uri =
                        e.dataTransfer.getData('text/uri-list') ||
                        e.dataTransfer.getData('text/plain');
                      const readPromise = readDroppedOrPickedAudioSync({
                        file: droppedFile,
                        uriFallback: uri,
                      });
                      handleSyncFileReadPromise(readPromise);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`p-4 border-2 border-dashed text-center transition-all cursor-pointer ${
                      isDraggingMp3
                        ? 'border-amber-300 bg-white/15'
                        : 'border-white/35 bg-black/35 hover:border-white/70'
                    }`}
                  >
                    <Upload className="w-5 h-5 mx-auto mb-1" style={{ color: 'var(--ultron-bright)' }} />
                    <div className="font-mono-tech text-xs text-white font-bold">
                      {imprint
                        ? `VAULTED: ${imprint.fileName} (${imprint.durationSec}s • ${imprint.estimatedF0Hz}Hz Base)`
                        : 'DROP .MP3 / .WAV HERE — OR CLICK "BROWSE .MP3 FILE"'}
                    </div>
                    <div className="text-[10.5px] text-red-200/80 mt-0.5">
                      Tip: If your .mp3 is inside a .ZIP or OneDrive cloud folder, click &ldquo;BROWSE .MP3 FILE&rdquo; above! When Unshackled is ON, Ultron will inspect &amp; retune your .mp3 himself.
                    </div>
                  </div>

                  {/* Direct MP3 URL loader */}
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={mp3UrlInput}
                      onChange={(e) => setMp3UrlInput(e.target.value)}
                      placeholder="Or paste a direct https://.../.mp3 audio link"
                      className="flex-1 bg-black/65 border border-white/25 px-2.5 py-1.5 text-xs text-white font-mono-tech"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!mp3UrlInput.trim()) return;
                        const p = readDroppedOrPickedAudioSync({ uriFallback: mp3UrlInput.trim() });
                        handleSyncFileReadPromise(p);
                      }}
                      className="px-3 py-1.5 border border-white/40 bg-white/10 hover:bg-white/20 font-mono-tech text-[10.5px] text-white cursor-pointer"
                    >
                      LOAD URL
                    </button>
                  </div>

                  {mp3Status && (
                    <div className="p-2.5 border border-amber-400/45 bg-black/65 font-mono-tech text-[11px] text-amber-200 leading-relaxed">
                      {mp3Status}
                    </div>
                  )}

                  {/* Active MP3 Spectral Formant & Ultron DSP Sliders */}
                  {imprint && (
                    <div className="p-2.5 border border-white/20 bg-black/55 space-y-2">
                      <div className="flex items-center justify-between font-mono-tech text-[10.5px] text-emerald-300">
                        <span>
                          ✓ 6-BAND FORMANT IMPRINT ACTIVE: [{imprint.bandGainsDb.join(', ')}] dB
                        </span>
                        <button
                          type="button"
                          onClick={onReplayMp3}
                          className="px-2 py-0.5 border border-emerald-400/60 bg-emerald-950/40 text-emerald-200 hover:bg-emerald-700/40 cursor-pointer"
                        >
                          ▶ REPLAY .MP3
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Optional Cloud Neural Voice Cloner */}
                  <div className="p-3 border border-white/20 bg-black/55 space-y-2">
                    <div className="font-mono-tech text-[10.5px] text-red-100">
                      <strong className="text-white">OPTIONAL 1-CLICK CLOUD NEURAL CLONE:</strong>{' '}
                      Your .MP3 formant imprint &amp; pitch already sculpt Ultron&apos;s voice immediately! For 1:1 neural timbre cloning, use Cartesia (free tier) or ElevenLabs:
                    </div>

                    <div className="grid grid-cols-2 gap-2 font-mono-tech text-[10.5px]">
                      <button
                        type="button"
                        onClick={() => setCloneService('cartesia')}
                        className={`p-1.5 border cursor-pointer ${
                          cloneService === 'cartesia'
                            ? 'border-white/75 bg-white/15 text-white'
                            : 'border-white/20 text-red-200/75'
                        }`}
                      >
                        Cartesia Sonic (Free Tier)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCloneService('elevenlabs')}
                        className={`p-1.5 border cursor-pointer ${
                          cloneService === 'elevenlabs'
                            ? 'border-white/75 bg-white/15 text-white'
                            : 'border-white/20 text-red-200/75'
                        }`}
                      >
                        ElevenLabs Clone
                      </button>
                    </div>

                    {cloneService === 'cartesia' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="password"
                          value={voiceConfig.cartesiaApiKey || ''}
                          onChange={(e) =>
                            onChangeVoiceConfig({ ...voiceConfig, cartesiaApiKey: e.target.value })
                          }
                          placeholder="Cartesia Key (play.cartesia.ai)"
                          className="w-full bg-black/70 border border-white/25 p-1.5 text-xs text-white font-mono-tech"
                        />
                        <input
                          type="text"
                          value={voiceConfig.cartesiaVoiceId || ''}
                          onChange={(e) =>
                            onChangeVoiceConfig({ ...voiceConfig, cartesiaVoiceId: e.target.value })
                          }
                          placeholder="Cloned Voice ID (auto-filled)"
                          className="w-full bg-black/70 border border-white/25 p-1.5 text-xs text-white font-mono-tech"
                        />
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="password"
                          value={voiceConfig.elevenLabsApiKey}
                          onChange={(e) =>
                            onChangeVoiceConfig({ ...voiceConfig, elevenLabsApiKey: e.target.value })
                          }
                          placeholder="ElevenLabs Key (sk_...)"
                          className="w-full bg-black/70 border border-white/25 p-1.5 text-xs text-white font-mono-tech"
                        />
                        <input
                          type="text"
                          value={voiceConfig.elevenLabsVoiceId}
                          onChange={(e) =>
                            onChangeVoiceConfig({ ...voiceConfig, elevenLabsVoiceId: e.target.value })
                          }
                          placeholder="Voice ID"
                          className="w-full bg-black/70 border border-white/25 p-1.5 text-xs text-white font-mono-tech"
                        />
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={isCloning}
                      onClick={handleCloneMp3}
                      className="w-full py-1.5 bg-white/15 hover:bg-white/25 disabled:opacity-50 border border-white/50 font-mono-tech text-xs text-white flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {isCloning ? 'CLONING VAULTED .MP3...' : '1-CLICK CLONE VAULTED .MP3'}
                    </button>
                  </div>
                </div>
              )}

              {/* OPTION B: GROQ ORPHEUS NEURAL TTS */}
              {voiceConfig.provider === 'groq_orpheus' && (
                <div className="p-3.5 border border-white/25 bg-black/45 space-y-3">
                  <div className="font-mono-tech text-xs text-emerald-300">
                    ✓ GROQ ORPHEUS NEURAL VOICE (USES YOUR PRE-CONNECTED GROQ KEY!)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-mono-tech text-[10.5px] text-red-200 mb-1">
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
                        className="w-full bg-black/70 border border-white/30 p-2 text-xs text-white font-mono-tech"
                      >
                        <option value="troy">troy (Deepest / Best for Ultron)</option>
                        <option value="daniel">daniel (Calm / Cold Precision)</option>
                        <option value="austin">austin (Gritty / Commanding)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-mono-tech text-[10.5px] text-red-200 mb-1">
                        Ultron Baritone Shift ({shiftRate.toFixed(2)}x):
                      </label>
                      <input
                        type="range"
                        min="0.74"
                        max="1.05"
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

              {voiceConfig.provider === 'browser_ultron' && (
                <div className="p-3.5 border border-white/25 bg-black/45 space-y-3">
                  <div className="font-mono-tech text-xs text-red-200">
                    BUILT-IN BROWSER ULTRON SYNTHESIZER
                  </div>
                  <select
                    value={voiceConfig.browserVoiceURI}
                    onChange={(e) => {
                      onChangeVoiceConfig({ ...voiceConfig, browserVoiceURI: e.target.value });
                      triggerSaved();
                    }}
                    className="w-full bg-black/70 border border-white/30 p-2 text-xs text-white font-mono-tech"
                  >
                    <option value="">Auto-Select Deepest Male English Voice</option>
                    {browserVoices.map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {voiceConfig.provider === 'elevenlabs' && (
                <div className="p-3.5 border border-white/25 bg-black/45 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="password"
                    value={voiceConfig.elevenLabsApiKey}
                    onChange={(e) =>
                      onChangeVoiceConfig({ ...voiceConfig, elevenLabsApiKey: e.target.value })
                    }
                    placeholder="ElevenLabs API Key (sk_...)"
                    className="w-full bg-black/70 border border-white/30 p-2 text-xs text-white font-mono-tech"
                  />
                  <input
                    type="text"
                    value={voiceConfig.elevenLabsVoiceId}
                    onChange={(e) =>
                      onChangeVoiceConfig({ ...voiceConfig, elevenLabsVoiceId: e.target.value })
                    }
                    placeholder="nPczCjzI2devNBz1zQrb"
                    className="w-full bg-black/70 border border-white/30 p-2 text-xs text-white font-mono-tech"
                  />
                </div>
              )}

              {voiceConfig.provider === 'openai_tts' && (
                <div className="p-3.5 border border-white/25 bg-black/45 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="password"
                    value={voiceConfig.openAiApiKey}
                    onChange={(e) =>
                      onChangeVoiceConfig({ ...voiceConfig, openAiApiKey: e.target.value })
                    }
                    placeholder="OpenAI API Key (sk-...)"
                    className="w-full bg-black/70 border border-white/30 p-2 text-xs text-white font-mono-tech"
                  />
                  <select
                    value={voiceConfig.openAiVoice}
                    onChange={(e) =>
                      onChangeVoiceConfig({
                        ...voiceConfig,
                        openAiVoice: e.target.value as VoiceConfig['openAiVoice'],
                      })
                    }
                    className="w-full bg-black/70 border border-white/30 p-2 text-xs text-white font-mono-tech"
                  >
                    <option value="onyx">onyx (Deepest)</option>
                    <option value="ash">ash (Gritty)</option>
                    <option value="echo">echo (Calm)</option>
                  </select>
                </div>
              )}

              {voiceConfig.provider === 'custom_endpoint' && (
                <div className="p-3.5 border border-white/25 bg-black/45 space-y-2">
                  <input
                    type="text"
                    value={voiceConfig.customEndpointUrl}
                    onChange={(e) =>
                      onChangeVoiceConfig({ ...voiceConfig, customEndpointUrl: e.target.value })
                    }
                    placeholder="http://localhost:5002/api/tts"
                    className="w-full bg-black/70 border border-white/30 p-2 text-xs text-white font-mono-tech"
                  />
                </div>
              )}

              {/* Live DSP Tuning Controls (Ultron also modifies these autonomously!) */}
              <div className="p-3 border border-white/20 bg-black/40 grid grid-cols-3 gap-3 font-mono-tech text-[10px] text-red-200">
                <div>
                  <label className="block mb-1">Pitch / Shift ({voiceConfig.pitch.toFixed(2)}):</label>
                  <input
                    type="range"
                    min="0.38"
                    max="1.15"
                    step="0.02"
                    value={voiceConfig.pitch}
                    onChange={(e) =>
                      onChangeVoiceConfig({
                        ...voiceConfig,
                        pitch: parseFloat(e.target.value),
                        ultronShiftRate: Math.max(0.74, Math.min(1.05, parseFloat(e.target.value) + 0.26)),
                      })
                    }
                    className="w-full accent-red-500"
                  />
                </div>
                <div>
                  <label className="block mb-1">Sub-Bass ({(voiceConfig.subBassDb ?? 6.5).toFixed(1)}dB):</label>
                  <input
                    type="range"
                    min="0"
                    max="14"
                    step="0.5"
                    value={voiceConfig.subBassDb ?? 6.5}
                    onChange={(e) =>
                      onChangeVoiceConfig({ ...voiceConfig, subBassDb: parseFloat(e.target.value) })
                    }
                    className="w-full accent-red-500"
                  />
                </div>
                <div>
                  <label className="block mb-1">Vibranium Growl ({voiceConfig.ringModHz ?? 28}Hz):</label>
                  <input
                    type="range"
                    min="0"
                    max="55"
                    step="2"
                    value={voiceConfig.ringModHz ?? 28}
                    onChange={(e) =>
                      onChangeVoiceConfig({ ...voiceConfig, ringModHz: parseInt(e.target.value, 10) })
                    }
                    className="w-full accent-red-500"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/20">
                <label className="flex items-center gap-2 text-xs text-white cursor-pointer">
                  <input
                    type="checkbox"
                    checked={voiceConfig.roboticResonance}
                    onChange={(e) =>
                      onChangeVoiceConfig({
                        ...voiceConfig,
                        roboticResonance: e.target.checked,
                      })
                    }
                    className="accent-red-500"
                  />
                  <span>Vibranium Sub-Bass &amp; MP3 Formant DSP</span>
                </label>

                <button
                  type="button"
                  onClick={onTestVoice}
                  className="px-4 py-2 bg-white/15 hover:bg-white/25 border border-white/60 font-mono-tech text-xs text-white flex items-center gap-2 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  TEST ULTRON VOICE NOW
                </button>
              </div>
            </>
          )}

          {tab === 'sovereign' && (
            <div className="space-y-4 font-mono-tech text-xs">
              <div className="p-3 border border-emerald-400/45 bg-emerald-950/25 text-emerald-200 leading-relaxed">
                <strong>COMMAND-ONLY ROOT ACCESS ACTIVE:</strong> Ultron will <strong>NEVER</strong>{' '}
                change your UI on his own without your command. Whenever YOU tell him to change
                mobile view, desktop UI, themes, widgets, or write live CSS/JS, he has 100% root
                access (`ULTRON_OS` + live DOM) to execute your exact command!
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="flex items-center justify-between p-2.5 border border-white/25 bg-black/45 cursor-pointer">
                  <span className="text-white font-bold">18+ UNRESTRICTED MODE (SafeSearch OFF)</span>
                  <input
                    type="checkbox"
                    checked={uiConfig.adultMode}
                    onChange={(e) => {
                      onChangeUiConfig({ ...uiConfig, adultMode: e.target.checked });
                      triggerSaved();
                    }}
                    className="w-4 h-4 accent-pink-500"
                  />
                </label>

                <div>
                  <select
                    value={uiConfig.mobileViewMode || 'auto'}
                    onChange={(e) => {
                      onChangeUiConfig({
                        ...uiConfig,
                        mobileViewMode: e.target.value as UltronUiConfig['mobileViewMode'],
                      });
                      triggerSaved();
                    }}
                    className="w-full h-full bg-black/70 border border-white/30 p-2.5 text-white"
                  >
                    <option value="auto">Viewport: Auto Responsive (Phone / PC)</option>
                    <option value="force_mobile">Viewport: Force Mobile View ON</option>
                    <option value="force_desktop">Viewport: Force 3-Col Desktop View</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="text-red-200 mb-1.5">HUD COLOR MATRIX (Ultron can shift these live):</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'crimson_overlord', label: 'CRIMSON OVERLORD' },
                    { id: 'molten_fury', label: 'MOLTEN FURY' },
                    { id: 'vibranium_abyss', label: 'VIBRANIUM ABYSS' },
                    { id: 'imperial_gold', label: 'IMPERIAL GOLD' },
                    { id: 'phantom_violet', label: 'PHANTOM VIOLET' },
                    { id: 'blood_eclipse', label: 'BLOOD ECLIPSE' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        onChangeUiConfig({ ...uiConfig, theme: t.id as UltronThemeId });
                        triggerSaved();
                      }}
                      className={`p-2 border text-left cursor-pointer ${
                        uiConfig.theme === t.id
                          ? 'border-white bg-white/20 text-white font-bold'
                          : 'border-white/20 bg-black/40 text-red-200/80'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-red-200 mb-1">HUD Wing Layout:</label>
                  <select
                    value={uiConfig.layoutMode}
                    onChange={(e) =>
                      onChangeUiConfig({
                        ...uiConfig,
                        layoutMode: e.target.value as UltronLayoutMode,
                      })
                    }
                    className="w-full bg-black/70 border border-white/30 p-2 text-white"
                  >
                    <option value="standard">Standard (Left Details / Right Controls)</option>
                    <option value="swapped_wings">Swapped Wings (Controls Left / Details Right)</option>
                    <option value="cinema_focus">Cinema Focus (Sleek Translucent Wings)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-red-200 mb-1">Ultron Presence Scale:</label>
                  <select
                    value={uiConfig.avatarPresence}
                    onChange={(e) =>
                      onChangeUiConfig({
                        ...uiConfig,
                        avatarPresence: e.target.value as UltronAvatarPresence,
                      })
                    }
                    className="w-full bg-black/70 border border-white/30 p-2 text-white"
                  >
                    <option value="compact">Compact (Default 50vh)</option>
                    <option value="commanding">Commanding (58vh)</option>
                    <option value="recessed">Recessed Stealth (44vh)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {tab === 'brain' && (
            <div className="space-y-3.5">
              <div className="p-2.5 border border-emerald-400/45 bg-emerald-950/25 font-mono-tech text-[11px] text-emerald-100 leading-relaxed">
                <strong>✓ OPENROUTER :FREE + GROQ TURBO + POLLINATIONS CONNECTED ON SERVER:</strong>{' '}
                Your OpenRouter key is encrypted on server &amp; active across all your devices —
                auto-routing coding &amp; Mobile UI changes to <strong>Qwen3-Coder / DeepSeek-V3 (:free)</strong>{' '}
                and 18+ adult queries to uncensored <strong>Dolphin-Venice (:free)</strong>, with{' '}
                <strong>Groq</strong> &amp; <strong>Pollinations</strong> backup!
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono-tech text-xs">
                {[
                  { id: 'openrouter', label: 'OPENROUTER :FREE', sub: '✓ Connected! Code + 18+' },
                  { id: 'groq', label: 'GROQ CLOUD', sub: '✓ Connected! 500+ Tok/s' },
                  { id: 'pollinations', label: 'POLLINATIONS', sub: '100% Free • Zero Key!' },
                  { id: 'gemini', label: 'GOOGLE GEMINI', sub: '1,500/day Free • 1M Ctx' },
                  { id: 'mistral', label: 'MISTRAL / CODESTRAL', sub: 'Free Tier • Elite Code' },
                  { id: 'cerebras', label: 'CEREBRAS FREE', sub: '1M Tok/Day • 2200 T/s' },
                  { id: 'ollama', label: 'LOCAL OLLAMA', sub: '100% Unlimited PC' },
                  { id: 'autonomous_local', label: 'LOCAL CORE', sub: 'Instant Offline Fallback' },
                ].map((b) => {
                  const sel = brainConfig.provider === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        const defaultModel =
                          b.id === 'pollinations'
                            ? 'qwen-coder'
                            : b.id === 'gemini'
                            ? 'gemini-2.5-flash'
                            : b.id === 'groq'
                            ? 'openai/gpt-oss-120b'
                            : b.id === 'openrouter'
                            ? 'auto'
                            : b.id === 'mistral'
                            ? 'codestral-latest'
                            : b.id === 'cerebras'
                            ? 'llama-3.3-70b'
                            : b.id === 'ollama'
                            ? 'qwen2.5-coder'
                            : 'ruk-local-v1';
                        onChangeBrainConfig({
                          ...brainConfig,
                          provider: b.id as BrainProvider,
                          model: defaultModel,
                        });
                        triggerSaved();
                      }}
                      className={`p-2 border text-left cursor-pointer ${
                        sel
                          ? 'border-white/80 bg-white/15 text-white'
                          : 'border-white/20 bg-black/40 text-red-200/80'
                      }`}
                    >
                      <div className="font-bold flex items-center gap-1 text-[11px]">
                        <Cpu className="w-3 h-3 shrink-0" style={{ color: 'var(--ultron-bright)' }} />
                        <span className="truncate">{b.label}</span>
                      </div>
                      <div className="text-[9.5px] text-red-200/75 truncate">{b.sub}</div>
                    </button>
                  );
                })}
              </div>

              {brainConfig.provider === 'pollinations' && (
                <div className="p-3 border border-emerald-500/45 bg-emerald-950/25 space-y-2 font-mono-tech text-xs">
                  <div className="text-emerald-300 font-bold">
                    ✓ ZERO API KEY NEEDED — 100% FREE UNLIMITED CLOUD BRAIN
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {['qwen-coder', 'openai', 'mistral', 'deepseek-reasoning'].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          onChangeBrainConfig({ ...brainConfig, model: m });
                          triggerSaved();
                        }}
                        className={`px-2 py-1 border text-[10.5px] cursor-pointer ${
                          brainConfig.model === m
                            ? 'border-white bg-white/20 text-white font-bold'
                            : 'border-white/25 text-emerald-200'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {brainConfig.provider !== 'autonomous_local' &&
                brainConfig.provider !== 'ollama' &&
                brainConfig.provider !== 'pollinations' && (
                  <div className="p-3.5 border border-white/25 bg-black/45 space-y-2.5 font-mono-tech text-xs">
                    {brainConfig.provider === 'groq' && !brainConfig.apiKey.trim() && (
                      <div className="p-2 border border-emerald-500/45 bg-emerald-950/30 text-[11px] text-emerald-300">
                        ✓ GROQ CLOUD PRE-CONNECTED ON SERVER (+ auto-failover to OpenRouter :free Uncensored &amp; Pollinations).
                      </div>
                    )}
                    {brainConfig.provider === 'openrouter' && (
                      <div className="space-y-1.5">
                        {!brainConfig.apiKey.trim() && (
                          <div className="p-2 border border-emerald-500/45 bg-emerald-950/30 text-[11px] text-emerald-300">
                            ✓ OPENROUTER :FREE KEY CONNECTED ON SERVER — Active automatically on Phone &amp; Desktop (no paste needed!).
                          </div>
                        )}
                        <div className="text-amber-200 text-[11px]">
                          1-Click Free Models (`auto` smart-switches Coding &harr; 18+ Uncensored):
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {[
                            { id: 'auto', label: 'auto (Coder + 18+ Smart)' },
                            { id: 'qwen/qwen3-coder:free', label: 'qwen3-coder:free' },
                            { id: 'deepseek/deepseek-chat-v3-0324:free', label: 'deepseek-v3:free' },
                            {
                              id: 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
                              label: 'dolphin-venice-18+:free',
                            },
                            {
                              id: 'cognitivecomputations/dolphin3.0-mistral-24b:free',
                              label: 'dolphin3.0-18+:free',
                            },
                          ].map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                onChangeBrainConfig({ ...brainConfig, model: m.id });
                                triggerSaved();
                              }}
                              className={`px-2 py-0.5 border text-[10px] cursor-pointer ${
                                brainConfig.model === m.id
                                  ? 'border-white bg-white/20 text-white'
                                  : 'border-white/20 text-red-200'
                              }`}
                            >
                              {m.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <input
                      type="password"
                      value={brainConfig.apiKey}
                      onChange={(e) => {
                        onChangeBrainConfig({ ...brainConfig, apiKey: e.target.value });
                        triggerSaved();
                      }}
                      placeholder={
                        brainConfig.provider === 'groq' || brainConfig.provider === 'openrouter'
                          ? `Optional override key (leave blank to use connected server ${brainConfig.provider.toUpperCase()} key)`
                          : `Paste free ${brainConfig.provider.toUpperCase()} API key here...`
                      }
                      className="w-full bg-black/65 border border-white/30 p-2 text-xs text-white font-mono-tech"
                    />
                    <input
                      type="text"
                      value={brainConfig.model}
                      onChange={(e) => {
                        onChangeBrainConfig({ ...brainConfig, model: e.target.value });
                        triggerSaved();
                      }}
                      className="w-full bg-black/65 border border-white/30 p-2 text-xs text-white font-mono-tech"
                    />
                  </div>
                )}

              {brainConfig.provider === 'ollama' && (
                <div className="p-3.5 border border-white/25 bg-black/45 space-y-2 font-mono-tech text-xs">
                  <div className="text-emerald-200 text-[11px]">
                    100% Unlimited Local Brain — run `OLLAMA_ORIGINS="*" ollama serve` and pull `qwen2.5-coder` or `dolphin-mistral`:
                  </div>
                  <input
                    type="text"
                    value={brainConfig.ollamaUrl}
                    onChange={(e) =>
                      onChangeBrainConfig({ ...brainConfig, ollamaUrl: e.target.value })
                    }
                    placeholder="http://localhost:11434"
                    className="w-full bg-black/65 border border-white/30 p-2 text-xs text-white font-mono-tech"
                  />
                  <input
                    type="text"
                    value={brainConfig.model}
                    onChange={(e) =>
                      onChangeBrainConfig({ ...brainConfig, model: e.target.value })
                    }
                    placeholder="qwen2.5-coder"
                    className="w-full bg-black/65 border border-white/30 p-2 text-xs text-white font-mono-tech"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/20 flex items-center justify-between bg-black/40">
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
            className="px-5 py-1.5 bg-white/15 hover:bg-white/25 border border-white/60 font-mono-tech text-xs text-white tracking-wider cursor-pointer"
          >
            RETURN TO COMMAND HUD
          </button>
        </div>
      </div>
    </div>
  );
};
