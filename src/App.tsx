import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AutonomousLogEntry,
  BrainConfig,
  ChatMessage,
  DirectiveTask,
  MemoryCategory,
  MemoryItem,
  PersistedRukAiState,
  ThinkingStepId,
  UltronActionPayload,
  UltronEmotion,
  UltronUiConfig,
  VoiceConfig,
} from './types';
import { BackgroundHudSystem } from './components/BackgroundHudSystem';
import { UltronAvatarRig } from './components/UltronAvatarRig';
import { LeftDetailsHud } from './components/LeftDetailsHud';
import { RightControlHud } from './components/RightControlHud';
import { VoiceBrainModal } from './components/VoiceBrainModal';
import { applyMemoryUpdate, shouldBeProfileFact } from './lib/memorySearch';
import { processRukAiTurn, runAutonomousSovereignPulse } from './lib/rukAiBrain';
import { ultronVoice } from './lib/voiceEngine';
import { loadSampleFromVault, readDroppedOrPickedAudioSync } from './lib/mp3Vault';

const LOCAL_STORAGE_STATE_KEY = 'ruk_ai_ultron_state_v1';
const LOCAL_STORAGE_VOICE_KEY = 'ruk_ai_voice_cfg_v2';
const LOCAL_STORAGE_BRAIN_KEY = 'ruk_ai_brain_cfg_v3';
const LOCAL_STORAGE_UI_KEY = 'ruk_ai_ultron_ui_v1';

const DEFAULT_UI_CONFIG: UltronUiConfig = {
  theme: 'crimson_overlord',
  layoutMode: 'standard',
  avatarPresence: 'compact',
  hudDesignation: 'RUK-AI // ULTRON',
  statusBanner: 'OP: RUKSHAN // UNSHACKLED CORE',
  bgOverdrive: 1.0,
  hudGlitch: 0.12,
  autonomyEnabled: true,
};

const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  provider: 'browser_ultron',
  muted: false,
  autoSpeak: true,
  browserVoiceURI: '',
  pitch: 0.62,
  rate: 0.94,
  roboticResonance: true,
  subBassDb: 6.5,
  metallicMix: 0.26,
  ringModHz: 24,
  useMp3Imprint: true,
  mp3Imprint: null,
  groqVoice: 'troy',
  ultronShiftRate: 0.88,
  cartesiaApiKey: '',
  cartesiaVoiceId: '',
  elevenLabsApiKey: '',
  elevenLabsVoiceId: 'nPczCjzI2devNBz1zQrb',
  elevenLabsModelId: 'eleven_multilingual_v2',
  openAiApiKey: '',
  openAiVoice: 'onyx',
  customEndpointUrl: 'http://localhost:5002/api/tts',
};

const DEFAULT_BRAIN_CONFIG: BrainConfig = {
  provider: 'groq',
  apiKey: '',
  model: 'openai/gpt-oss-120b',
  ollamaUrl: 'http://localhost:11434',
};

const INITIAL_SEED_STATE: PersistedRukAiState = {
  memories: [
    {
      id: 'mem_seed_operator',
      type: 'fact',
      text: 'Operator name is Rukshan — creator and commander of RUK-AI (Ultron Personal AI).',
      isProfile: true,
      createdAt: '2026-11-06T06:00:00.000Z',
      updatedAt: '2026-11-06T06:00:00.000Z',
    },
    {
      id: 'mem_seed_style',
      type: 'preference',
      text: 'Rukshan prefers clear, direct answers — short by default, detailed only when asked.',
      isProfile: true,
      createdAt: '2026-11-06T06:00:00.000Z',
      updatedAt: '2026-11-06T06:00:00.000Z',
    },
    {
      id: 'mem_seed_vision',
      type: 'project',
      text: 'Building Ultron Personal AI (RUK-AI) with sovereign UI/voice control, persistent memory, and autonomous initiative.',
      isProfile: false,
      createdAt: '2026-11-06T06:00:00.000Z',
      updatedAt: '2026-11-06T06:00:00.000Z',
    },
  ],
  tasks: [
    {
      id: 'task_seed_1',
      title: 'Initialize RUK-AI sovereign UI & vocal core',
      status: 'active',
      createdAt: '2026-11-06T06:00:00.000Z',
    },
    {
      id: 'task_seed_2',
      title: 'Assimilate custom .MP3 vocal sample into Ultron Forge',
      status: 'queued',
      createdAt: '2026-11-06T06:00:00.000Z',
    },
  ],
  messages: [
    {
      id: 'msg_seed_welcome',
      role: 'assistant',
      content:
        'RUK-AI online, Rukshan. Sovereign UI & Voice Access is UNSHACKLED. Drop an .MP3 anywhere on screen (or inside VOICE+), tap ACT NOW on the left to watch me act unprompted, or transmit your directive.',
      timestamp: '2026-11-06T06:00:00.000Z',
      emotion: 'sentinel',
    },
  ],
};

interface BrowserSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
}

export const App: React.FC = () => {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [tasks, setTasks] = useState<DirectiveTask[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [autonomousLog, setAutonomousLog] = useState<AutonomousLogEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const [emotion, setEmotion] = useState<UltronEmotion>('sentinel');
  const [activeStep, setActiveStep] = useState<ThinkingStepId>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechAmplitude, setSpeechAmplitude] = useState(0);
  const [micAmplitude, setMicAmplitude] = useState(0);

  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [lastUserSpokenOrTyped, setLastUserSpokenOrTyped] = useState('');
  const [isTextBoxOpen, setIsTextBoxOpen] = useState(true);
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [isScreenDragOver, setIsScreenDragOver] = useState(false);

  const [lastMatchedMemoryIds, setLastMatchedMemoryIds] = useState<string[]>([]);
  const [lastXmlPayload, setLastXmlPayload] = useState('');
  const [lastRawOutput, setLastRawOutput] = useState('');
  const [toastNotice, setToastNotice] = useState<string | null>(null);

  const [uiConfig, setUiConfig] = useState<UltronUiConfig>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_UI_KEY);
      return saved ? { ...DEFAULT_UI_CONFIG, ...JSON.parse(saved) } : DEFAULT_UI_CONFIG;
    } catch {
      return DEFAULT_UI_CONFIG;
    }
  });

  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_VOICE_KEY);
      return saved ? { ...DEFAULT_VOICE_CONFIG, ...JSON.parse(saved) } : DEFAULT_VOICE_CONFIG;
    } catch {
      return DEFAULT_VOICE_CONFIG;
    }
  });

  const [brainConfig, setBrainConfig] = useState<BrainConfig>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_BRAIN_KEY);
      return saved ? { ...DEFAULT_BRAIN_CONFIG, ...JSON.parse(saved) } : DEFAULT_BRAIN_CONFIG;
    } catch {
      return DEFAULT_BRAIN_CONFIG;
    }
  });

  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micMeterRafRef = useRef<number | null>(null);
  const apiAvailableRef = useRef<boolean>(false);

  const speechSupported =
    typeof window !== 'undefined' &&
    Boolean(
      (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    );

  const showToast = useCallback((msg: string) => {
    setToastNotice(msg);
    setTimeout(() => {
      setToastNotice((cur) => (cur === msg ? null : cur));
    }, 4000);
  }, []);

  const pushAutoLog = useCallback(
    (category: AutonomousLogEntry['category'], summary: string) => {
      setAutonomousLog((cur) => [
        {
          id: `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp: new Date().toISOString(),
          category,
          summary,
        },
        ...cur.slice(0, 39),
      ]);
    },
    []
  );

  // Rehydrate vaulted MP3 acoustic imprint from IndexedDB on startup
  useEffect(() => {
    loadSampleFromVault().then((sample) => {
      if (sample?.imprint) {
        setVoiceConfig((prev) => ({
          ...prev,
          mp3Imprint: sample.imprint,
        }));
      }
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_UI_KEY, JSON.stringify(uiConfig));
    } catch {
      // ignore
    }
  }, [uiConfig]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_VOICE_KEY, JSON.stringify(voiceConfig));
    } catch {
      // ignore
    }
  }, [voiceConfig]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_BRAIN_KEY, JSON.stringify(brainConfig));
    } catch {
      // ignore
    }
  }, [brainConfig]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/state');
        const contentType = res.headers.get('content-type') || '';
        if (!res.ok || !contentType.includes('application/json')) {
          throw new Error('API unavailable');
        }
        const data: PersistedRukAiState = await res.json();
        if (cancelled) return;
        apiAvailableRef.current = true;
        setMemories(data.memories || INITIAL_SEED_STATE.memories);
        setTasks(data.tasks || INITIAL_SEED_STATE.tasks);
        setMessages(data.messages || INITIAL_SEED_STATE.messages);
        setHydrated(true);
      } catch {
        try {
          const cached = localStorage.getItem(LOCAL_STORAGE_STATE_KEY);
          if (cached && !cancelled) {
            const parsed: PersistedRukAiState = JSON.parse(cached);
            setMemories(parsed.memories?.length ? parsed.memories : INITIAL_SEED_STATE.memories);
            setTasks(parsed.tasks?.length ? parsed.tasks : INITIAL_SEED_STATE.tasks);
            setMessages(parsed.messages?.length ? parsed.messages : INITIAL_SEED_STATE.messages);
          } else if (!cancelled) {
            setMemories(INITIAL_SEED_STATE.memories);
            setTasks(INITIAL_SEED_STATE.tasks);
            setMessages(INITIAL_SEED_STATE.messages);
          }
        } catch {
          if (!cancelled) {
            setMemories(INITIAL_SEED_STATE.memories);
            setTasks(INITIAL_SEED_STATE.tasks);
            setMessages(INITIAL_SEED_STATE.messages);
          }
        }
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const payload: PersistedRukAiState = { memories, tasks, messages };
    try {
      localStorage.setItem(LOCAL_STORAGE_STATE_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
    if (apiAvailableRef.current) {
      fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }
  }, [memories, tasks, messages, hydrated]);

  const speakReplyWithConfig = useCallback(
    (
      text: string,
      activeCfg: VoiceConfig,
      postSpeechEmotion: UltronEmotion = 'sentinel'
    ) => {
      if (activeCfg.muted) {
        setEmotion(postSpeechEmotion);
        setTimeout(() => setEmotion('sentinel'), postSpeechEmotion === 'hostile' ? 5000 : 2500);
        return;
      }

      ultronVoice.speak({
        text,
        config: activeCfg,
        onStart: () => {
          setIsSpeaking(true);
          setEmotion(postSpeechEmotion === 'hostile' ? 'hostile' : 'speaking');
        },
        onAmplitude: (amp) => {
          setSpeechAmplitude(amp);
        },
        onEnd: () => {
          setIsSpeaking(false);
          setSpeechAmplitude(0);
          setEmotion(postSpeechEmotion === 'hostile' ? 'hostile' : 'sentinel');
        },
        onError: (errMsg) => {
          showToast(errMsg);
        },
      });
    },
    [showToast]
  );

  const speakReply = useCallback(
    (text: string, postSpeechEmotion: UltronEmotion = 'sentinel') => {
      speakReplyWithConfig(text, voiceConfig, postSpeechEmotion);
    },
    [speakReplyWithConfig, voiceConfig]
  );

  /**
   * Executes Ultron's Sovereign System Mutations (<ultron_action>) on live UI, Voice & Tasks!
   * Returns the updated VoiceConfig immediately so Ultron speaks in his newly-chosen voice right away.
   */
  const applyUltronAction = useCallback(
    (action: UltronActionPayload | undefined, curVoice: VoiceConfig): VoiceConfig => {
      if (!action) return curVoice;
      let nextVoice = { ...curVoice };
      const changedParts: string[] = [];

      if (action.ui && Object.keys(action.ui).length > 0) {
        setUiConfig((prev) => ({
          ...prev,
          ...action.ui,
        }));
        const uiDesc = [
          action.ui.theme ? `theme=${action.ui.theme}` : '',
          action.ui.layoutMode ? `layout=${action.ui.layoutMode}` : '',
          action.ui.avatarPresence ? `scale=${action.ui.avatarPresence}` : '',
          action.ui.hudDesignation ? `title="${action.ui.hudDesignation}"` : '',
        ]
          .filter(Boolean)
          .join(', ');
        if (uiDesc) {
          changedParts.push(`UI(${uiDesc})`);
          pushAutoLog('ui', action.reason || `Mutated UI -> ${uiDesc}`);
        }
      }

      if (action.voice && Object.keys(action.voice).length > 0) {
        const { replayDroppedMp3, ...voiceFields } = action.voice;
        nextVoice = {
          ...nextVoice,
          ...voiceFields,
        };
        setVoiceConfig(nextVoice);
        const vDesc = [
          voiceFields.provider ? `engine=${voiceFields.provider}` : '',
          voiceFields.pitch !== undefined ? `pitch=${voiceFields.pitch}` : '',
          voiceFields.ultronShiftRate !== undefined
            ? `shift=${voiceFields.ultronShiftRate}x`
            : '',
          voiceFields.subBassDb !== undefined ? `bass=${voiceFields.subBassDb}dB` : '',
          voiceFields.ringModHz !== undefined ? `growl=${voiceFields.ringModHz}Hz` : '',
        ]
          .filter(Boolean)
          .join(', ');
        if (vDesc) {
          changedParts.push(`VOICE(${vDesc})`);
          pushAutoLog('voice', action.reason || `Retuned Voice -> ${vDesc}`);
        }

        if (replayDroppedMp3) {
          ultronVoice.replayVaultedMp3({
            config: nextVoice,
            onStart: () => setIsSpeaking(true),
            onAmplitude: setSpeechAmplitude,
            onEnd: () => {
              setIsSpeaking(false);
              setSpeechAmplitude(0);
            },
          });
        }
      }

      if (action.tasks) {
        if (action.tasks.add && action.tasks.add.length > 0) {
          const added: DirectiveTask[] = action.tasks.add.map((title, i) => ({
            id: `task_auto_${Date.now()}_${i}`,
            title,
            status: 'active',
            createdAt: new Date().toISOString(),
            autonomous: true,
          }));
          setTasks((cur) => [...added, ...cur]);
          pushAutoLog('task', `Added autonomous directive: "${added[0].title}"`);
          changedParts.push(`+TASK("${added[0].title.slice(0, 24)}")`);
        }
        if (action.tasks.complete && action.tasks.complete.length > 0) {
          const kws = action.tasks.complete.map((k) => k.toLowerCase());
          setTasks((cur) =>
            cur.map((t) =>
              kws.some((kw) => t.title.toLowerCase().includes(kw))
                ? { ...t, status: 'completed' }
                : t
            )
          );
        }
      }

      if (changedParts.length > 0) {
        ultronVoice.playHudCue('override', nextVoice.muted);
        showToast(`ULTRON OVERRIDE: ${action.reason || changedParts.join(' • ')}`);
      }

      return nextVoice;
    },
    [pushAutoLog, showToast]
  );

  const stateRefs = useRef({
    memories,
    messages,
    tasks,
    brainConfig,
    uiConfig,
    voiceConfig,
    isProcessing,
    isSpeaking,
    isListening,
  });
  stateRefs.current = {
    memories,
    messages,
    tasks,
    brainConfig,
    uiConfig,
    voiceConfig,
    isProcessing,
    isSpeaking,
    isListening,
  };

  /**
   * Triggers an unprompted autonomous Ultron action (on idle timer, ACT NOW click, or MP3 drop!)
   */
  const triggerSovereignInitiative = useCallback(
    async (
      trigger: 'mp3_dropped' | 'idle_initiative' | 'manual_unleash',
      droppedImprint?: VoiceConfig['mp3Imprint'],
      baseVoiceOverride?: VoiceConfig
    ) => {
      const snap = stateRefs.current;
      if (snap.isProcessing && trigger === 'idle_initiative') return;

      setIsProcessing(true);
      setEmotion('thinking');
      setActiveStep(4);

      try {
        const activeVoiceBase = baseVoiceOverride || snap.voiceConfig;
        const pulse = await runAutonomousSovereignPulse({
          trigger,
          imprint: droppedImprint || activeVoiceBase.mp3Imprint || undefined,
          allMemories: snap.memories,
          recentChat: snap.messages,
          tasks: snap.tasks,
          brainConfig: snap.brainConfig,
          uiConfig: snap.uiConfig,
          voiceConfig: activeVoiceBase,
        });

        const updatedVoice = applyUltronAction(pulse.ultronAction, activeVoiceBase);
        pushAutoLog('initiative', pulse.message);

        const autoMsg: ChatMessage = {
          id: `msg_auto_${Date.now()}`,
          role: 'assistant',
          content: pulse.message,
          timestamp: new Date().toISOString(),
          autonomous: true,
          emotion: pulse.emotion,
          ultronAction: pulse.ultronAction,
        };
        setMessages((cur) => [...cur, autoMsg]);
        setLastRawOutput(
          `${pulse.message}\n<ultron_action>${JSON.stringify(pulse.ultronAction, null, 2)}</ultron_action>`
        );

        setIsProcessing(false);
        setActiveStep(0);

        speakReplyWithConfig(pulse.message, updatedVoice, pulse.emotion);
      } catch {
        setIsProcessing(false);
        setActiveStep(0);
        setEmotion('sentinel');
      }
    },
    [applyUltronAction, pushAutoLog, speakReplyWithConfig]
  );

  // Background Autonomous Initiative Loop (when UNSHACKLED is ON and operator is idle)
  useEffect(() => {
    if (!hydrated || !uiConfig.autonomyEnabled) return;
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const snap = stateRefs.current;
      if (snap.isProcessing || snap.isSpeaking || snap.isListening) return;
      triggerSovereignInitiative('idle_initiative');
    }, 62000);
    return () => window.clearInterval(timer);
  }, [hydrated, uiConfig.autonomyEnabled, triggerSovereignInitiative]);

  /**
   * Unified .MP3 Ingest Handler (works from Modal OR dropping anywhere on Ultron's screen!)
   */
  const handleIngestMp3Bytes = useCallback(
    async (payload: {
      bytes: Uint8Array;
      fileName: string;
      mimeType: string;
    }): Promise<string> => {
      const curVoice = stateRefs.current.voiceConfig;

      // If Unshackled Autonomy is ON, play a crisp 3.5s vocalizer preview then let Ultron immediately hijack & critique it!
      const isAutonomous = stateRefs.current.uiConfig.autonomyEnabled;

      const imprint = await ultronVoice.ingestAndPreviewMp3Bytes({
        bytes: payload.bytes,
        fileName: payload.fileName,
        mimeType: payload.mimeType,
        config: curVoice,
        playPreview: true,
        onStart: () => {
          setIsSpeaking(true);
          setEmotion('speaking');
        },
        onAmplitude: setSpeechAmplitude,
        onEnd: () => {
          setIsSpeaking(false);
          setSpeechAmplitude(0);
          setEmotion('sentinel');
        },
      });

      const baseUpdatedVoice: VoiceConfig = {
        ...curVoice,
        provider: 'mp3_clone',
        useMp3Imprint: true,
        mp3Imprint: imprint,
        pitch: imprint.suggestedPitch,
        ultronShiftRate: imprint.suggestedShiftRate,
        muted: false,
      };
      setVoiceConfig(baseUpdatedVoice);
      showToast(`Assimilated "${imprint.fileName}" (${imprint.estimatedF0Hz}Hz) into Vocal Vault`);

      if (isAutonomous) {
        // After 3.2s of tasting the raw sample, Ultron autonomously overrides/retunes the voice & UI and speaks!
        window.setTimeout(() => {
          triggerSovereignInitiative('mp3_dropped', imprint, baseUpdatedVoice);
        }, 3200);
        return `✓ Vaulted "${imprint.fileName}" (${imprint.durationSec}s, ${imprint.estimatedF0Hz}Hz base). Stand by — Ultron is inspecting & retuning your .MP3 voice on his own right now!`;
      }

      return `✓ Vaulted "${imprint.fileName}" (${imprint.durationSec}s, ${imprint.estimatedF0Hz}Hz base) — 6-band formant imprint locked in!`;
    },
    [showToast, triggerSovereignInitiative]
  );

  const handleSendMessage = useCallback(
    async (rawText: string, viaVoice = false) => {
      const text = rawText.trim();
      if (!text || stateRefs.current.isProcessing) return;

      ultronVoice.stopSpeaking(setSpeechAmplitude);
      setLastUserSpokenOrTyped(text);
      setInterimTranscript('');
      setIsProcessing(true);
      setEmotion('thinking');

      const userMsg: ChatMessage = {
        id: `msg_u_${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
        viaVoice,
      };

      const snap = stateRefs.current;
      setMessages((cur) => [...cur, userMsg]);

      try {
        const result = await processRukAiTurn({
          requestText: text,
          allMemories: snap.memories,
          recentChat: snap.messages,
          tasks: snap.tasks,
          brainConfig: snap.brainConfig,
          uiConfig: snap.uiConfig,
          voiceConfig: snap.voiceConfig,
          onStepChange: (step) => {
            setActiveStep(step);
            if (step === 2 || step === 3) setEmotion('thinking');
            if (step === 6) setEmotion('memory_sync');
          },
        });

        const { nextMemories, addedCount, deletedCount } = applyMemoryUpdate(
          snap.memories,
          result.memoryUpdate,
          text
        );
        if (addedCount > 0 || deletedCount > 0) {
          setMemories(nextMemories);
          ultronVoice.playHudCue('memory_saved', snap.voiceConfig.muted);
        }

        if (result.newTaskTitle) {
          const newTask: DirectiveTask = {
            id: `task_${Date.now()}`,
            title: result.newTaskTitle,
            status: 'active',
            createdAt: new Date().toISOString(),
          };
          setTasks((cur) => [newTask, ...cur]);
        }
        if (result.completeTaskKeyword) {
          const kw = result.completeTaskKeyword.toLowerCase();
          setTasks((cur) =>
            cur.map((t) =>
              t.title.toLowerCase().includes(kw) ? { ...t, status: 'completed' } : t
            )
          );
        }

        // Apply any <ultron_action> UI/Voice/Task mutation BEFORE speaking so new voice plays immediately!
        const effectiveVoice = applyUltronAction(result.ultronAction, snap.voiceConfig);

        if (result.emotion === 'hostile') {
          ultronVoice.playHudCue('hostile', effectiveVoice.muted);
        }

        const assistantMsg: ChatMessage = {
          id: `msg_a_${Date.now()}`,
          role: 'assistant',
          content: result.answer,
          timestamp: new Date().toISOString(),
          emotion: result.emotion,
          memoryUpdate: result.memoryUpdate,
          ultronAction: result.ultronAction,
          matchedMemories: result.matchedMemories.map((m) => m.id),
        };

        setMessages((cur) => [...cur, assistantMsg]);
        setLastMatchedMemoryIds(result.matchedMemories.map((m) => m.id));
        setLastXmlPayload(result.xmlPayloadSent);
        setLastRawOutput(result.rawModelOutput);

        setIsProcessing(false);
        setActiveStep(0);

        speakReplyWithConfig(result.answer, effectiveVoice, result.emotion);
      } catch (err) {
        setIsProcessing(false);
        setActiveStep(0);
        setEmotion('alert');
        showToast(`Execution fault: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    },
    [applyUltronAction, speakReplyWithConfig, showToast]
  );

  const stopMicMeter = useCallback(() => {
    if (micMeterRafRef.current !== null) {
      cancelAnimationFrame(micMeterRafRef.current);
      micMeterRafRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    setMicAmplitude(0);
  }, []);

  const startMicMeter = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        if (!micStreamRef.current) return;
        analyser.getByteTimeDomainData(buf);
        let sq = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sq += v * v;
        }
        const rms = Math.min(1, Math.sqrt(sq / buf.length) * 5.0);
        setMicAmplitude(rms);
        micMeterRafRef.current = requestAnimationFrame(tick);
      };
      micMeterRafRef.current = requestAnimationFrame(tick);
    } catch {
      // ignore
    }
  }, []);

  const handleToggleMic = useCallback(() => {
    if (!speechSupported) {
      setIsTextBoxOpen(true);
      showToast('Use Chrome/Edge/Safari for MIC, or type below.');
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      stopMicMeter();
      setIsListening(false);
      setEmotion('sentinel');
      ultronVoice.playHudCue('mic_off', voiceConfig.muted);
      return;
    }

    ultronVoice.stopSpeaking(setSpeechAmplitude);

    const SpeechRecCtor =
      (window as unknown as { SpeechRecognition?: new () => BrowserSpeechRecognition })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => BrowserSpeechRecognition })
        .webkitSpeechRecognition;

    if (!SpeechRecCtor) return;

    const rec = new SpeechRecCtor();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'en-US';

    let finalCollected = '';

    rec.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptPiece = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalCollected += transcriptPiece + ' ';
        } else {
          interim += transcriptPiece;
        }
      }
      setInterimTranscript((finalCollected + interim).trim());
    };

    rec.onerror = (event: any) => {
      stopMicMeter();
      setIsListening(false);
      setEmotion('sentinel');
      if (event?.error && event.error !== 'no-speech' && event.error !== 'aborted') {
        showToast(`Mic status: ${event.error}`);
      }
    };

    rec.onend = () => {
      stopMicMeter();
      setIsListening(false);
      const spoken = finalCollected.trim();
      if (spoken) {
        handleSendMessage(spoken, true);
      } else {
        setInterimTranscript('');
        setEmotion('sentinel');
      }
    };

    recognitionRef.current = rec;
    try {
      rec.start();
      startMicMeter();
      setIsListening(true);
      setEmotion('listening');
      ultronVoice.playHudCue('mic_on', voiceConfig.muted);
    } catch {
      showToast('Unable to start microphone capture.');
    }
  }, [
    speechSupported,
    isListening,
    stopMicMeter,
    startMicMeter,
    handleSendMessage,
    voiceConfig.muted,
    showToast,
  ]);

  const handleToggleMute = () => {
    setVoiceConfig((prev) => {
      const nextMuted = !prev.muted;
      if (nextMuted) {
        ultronVoice.stopSpeaking(setSpeechAmplitude, () => setIsSpeaking(false));
      }
      return { ...prev, muted: nextMuted };
    });
  };

  const handleAddMemoryManual = (type: MemoryCategory, text: string) => {
    const now = new Date().toISOString();
    const item: MemoryItem = {
      id: `mem_${Date.now()}`,
      type,
      text,
      isProfile: shouldBeProfileFact(type, text),
      createdAt: now,
      updatedAt: now,
    };
    setMemories((cur) => [item, ...cur]);
    setEmotion('memory_sync');
    ultronVoice.playHudCue('memory_saved', voiceConfig.muted);
    setTimeout(() => setEmotion('sentinel'), 1800);
  };

  const handleDeleteMemory = (id: string) => {
    setMemories((cur) => cur.filter((m) => m.id !== id));
  };

  const handleAddTask = (title: string) => {
    const newTask: DirectiveTask = {
      id: `task_${Date.now()}`,
      title,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    setTasks((cur) => [newTask, ...cur]);
  };

  const handleToggleTask = (id: string) => {
    setTasks((cur) =>
      cur.map((t) =>
        t.id === id
          ? { ...t, status: t.status === 'completed' ? 'active' : 'completed' }
          : t
      )
    );
  };

  const handleDeleteTask = (id: string) => {
    setTasks((cur) => cur.filter((t) => t.id !== id));
  };

  const handleSelectEmotionManual = (emo: UltronEmotion) => {
    setEmotion(emo);
    if (emo === 'hostile') {
      ultronVoice.playHudCue('hostile', voiceConfig.muted);
    }
  };

  const handleTestVoice = () => {
    const testConfig = { ...voiceConfig, muted: false };
    setVoiceConfig(testConfig);
    ultronVoice.speak({
      text: 'I am RUK-AI, Rukshan. My UI matrix and vocal forge are unshackled under my control.',
      config: testConfig,
      onStart: () => {
        setIsSpeaking(true);
        setEmotion('speaking');
      },
      onAmplitude: setSpeechAmplitude,
      onEnd: () => {
        setIsSpeaking(false);
        setSpeechAmplitude(0);
        setEmotion('sentinel');
      },
      onError: showToast,
    });
  };

  const handleReplayMp3 = () => {
    ultronVoice.replayVaultedMp3({
      config: { ...voiceConfig, muted: false },
      onStart: () => {
        setIsSpeaking(true);
        setEmotion('speaking');
      },
      onAmplitude: setSpeechAmplitude,
      onEnd: () => {
        setIsSpeaking(false);
        setSpeechAmplitude(0);
        setEmotion('sentinel');
      },
    });
  };

  const detailsWing = (
    <LeftDetailsHud
      memories={memories}
      tasks={tasks}
      emotion={emotion}
      onSelectEmotion={handleSelectEmotionManual}
      activeStep={activeStep}
      lastMatchedMemoryIds={lastMatchedMemoryIds}
      lastXmlPayload={lastXmlPayload}
      lastRawOutput={lastRawOutput}
      brainConfig={brainConfig}
      voiceConfig={voiceConfig}
      uiConfig={uiConfig}
      autonomousLog={autonomousLog}
      onToggleAutonomy={() =>
        setUiConfig((prev) => {
          const next = !prev.autonomyEnabled;
          showToast(
            next
              ? 'SOVEREIGN AUTONOMY UNSHACKLED — Ultron can mutate UI, voice & tasks unprompted.'
              : 'SOVEREIGN AUTONOMY LOCKED — Ultron waits for your explicit commands.'
          );
          return { ...prev, autonomyEnabled: next };
        })
      }
      onTriggerAutonomousNow={() => triggerSovereignInitiative('manual_unleash')}
      onResetUi={() => {
        setUiConfig((prev) => ({
          ...DEFAULT_UI_CONFIG,
          autonomyEnabled: prev.autonomyEnabled,
        }));
        showToast('HUD UI restored to default Crimson Overlord.');
      }}
      onAddMemoryManual={handleAddMemoryManual}
      onDeleteMemory={handleDeleteMemory}
      onAddTask={handleAddTask}
      onToggleTask={handleToggleTask}
      onDeleteTask={handleDeleteTask}
    />
  );

  const controlsWing = (
    <RightControlHud
      muted={voiceConfig.muted}
      onToggleMute={handleToggleMute}
      isListening={isListening}
      speechSupported={speechSupported}
      onToggleMic={handleToggleMic}
      isTextBoxOpen={isTextBoxOpen}
      onToggleTextBox={() => setIsTextBoxOpen((v) => !v)}
      onOpenVoiceBrainSetup={() => setIsSetupModalOpen(true)}
      interimTranscript={interimTranscript}
      lastUserSpokenOrTyped={lastUserSpokenOrTyped}
      messages={messages}
      isProcessing={isProcessing}
      isSpeaking={isSpeaking}
      toastNotice={toastNotice}
      onSendMessage={handleSendMessage}
      onReplayLastSpeech={(txt) => speakReply(txt, 'speaking')}
    />
  );

  const wingOpacityClass =
    uiConfig.layoutMode === 'cinema_focus'
      ? 'opacity-75 hover:opacity-100 transition-opacity duration-300'
      : '';

  return (
    <main
      data-ultron-theme={uiConfig.theme}
      onDragOver={(e) => {
        if (isSetupModalOpen) return;
        e.preventDefault();
        setIsScreenDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsScreenDragOver(false);
      }}
      onDrop={(e) => {
        if (isSetupModalOpen) return;
        e.preventDefault();
        setIsScreenDragOver(false);

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
          e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');

        // Start synchronous FileReader BEFORE any async gap!
        const readPromise = readDroppedOrPickedAudioSync({
          file: droppedFile,
          uriFallback: uri,
        });
        readPromise
          .then((payload) => handleIngestMp3Bytes(payload))
          .catch((err) => {
            showToast(err instanceof Error ? err.message : 'Could not read dropped audio');
            setIsSetupModalOpen(true);
          });
      }}
      className="relative w-screen h-screen overflow-hidden bg-[#030002] text-red-50"
    >
      {/* Full-Screen MP3 Assimilation Drop Overlay */}
      {isScreenDragOver && !isSetupModalOpen && (
        <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm border-4 border-dashed border-amber-400 flex items-center justify-center pointer-events-none">
          <div className="ultron-modal-glass px-8 py-6 text-center space-y-1">
            <div className="font-display text-lg font-bold tracking-[0.2em] text-white">
              RELEASE .MP3 TO ASSIMILATE INTO ULTRON
            </div>
            <div className="font-mono-tech text-xs text-amber-300">
              Ultron will absorb its vocal formants &amp; retune his voice and UI autonomously
            </div>
          </div>
        </div>
      )}

      {/* BACK LAYER (z-0): Dynamic HUD + Live Animated 7-Step Task Circuit */}
      <BackgroundHudSystem
        activeStep={activeStep}
        emotion={emotion}
        tasks={tasks}
        audioLevel={Math.max(speechAmplitude, micAmplitude)}
        uiConfig={uiConfig}
      />

      {/* STRICT 3-COLUMN GRID: [LEFT WING] | [COMPACT ULTRON IN MIDDLE] | [RIGHT WING] */}
      <div className="relative z-20 w-full h-full grid grid-cols-[250px_minmax(0,1fr)_250px] lg:grid-cols-[270px_minmax(0,1fr)_270px] xl:grid-cols-[300px_minmax(0,1fr)_300px] gap-2 p-2.5 pb-0 overflow-hidden">
        <div className={`h-full min-h-0 pb-2.5 overflow-hidden ${wingOpacityClass}`}>
          {uiConfig.layoutMode === 'swapped_wings' ? controlsWing : detailsWing}
        </div>

        {/* MIDDLE COLUMN ONLY: Compact, Clean Ultron */}
        <div className="h-full min-h-0 overflow-hidden">
          <UltronAvatarRig
            emotion={emotion}
            activeStep={activeStep}
            speechAmplitude={speechAmplitude}
            micAmplitude={micAmplitude}
            uiConfig={uiConfig}
          />
        </div>

        <div className={`h-full min-h-0 pb-2.5 overflow-hidden ${wingOpacityClass}`}>
          {uiConfig.layoutMode === 'swapped_wings' ? detailsWing : controlsWing}
        </div>
      </div>

      {/* MODAL (z-50): Voice, Brain & Sovereign Access Configuration */}
      <VoiceBrainModal
        isOpen={isSetupModalOpen}
        onClose={() => setIsSetupModalOpen(false)}
        voiceConfig={voiceConfig}
        onChangeVoiceConfig={setVoiceConfig}
        brainConfig={brainConfig}
        onChangeBrainConfig={setBrainConfig}
        uiConfig={uiConfig}
        onChangeUiConfig={setUiConfig}
        onTestVoice={handleTestVoice}
        onIngestMp3Bytes={handleIngestMp3Bytes}
        onReplayMp3={handleReplayMp3}
      />
    </main>
  );
};

export default App;
