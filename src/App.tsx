import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AutonomousLogEntry,
  BrainConfig,
  ChatMessage,
  CommsPlatform,
  CommsVaultConfig,
  DirectiveTask,
  MemoryCategory,
  MemoryItem,
  PersistedRukAiState,
  SearchBundle,
  ThinkingStepId,
  UltronActionPayload,
  UltronCodePayload,
  UltronDomPatchAction,
  UltronEmotion,
  UltronUiConfig,
  UnseenCommsMessage,
  VoiceConfig,
} from './types';
import { BackgroundHudSystem } from './components/BackgroundHudSystem';
import { UltronAvatarRig } from './components/UltronAvatarRig';
import { LeftDetailsHud } from './components/LeftDetailsHud';
import { RightControlHud } from './components/RightControlHud';
import { VoiceBrainModal } from './components/VoiceBrainModal';
import { OmniViewportDeck } from './components/OmniViewportDeck';
import { CommsHubModal } from './components/CommsHubModal';
import { applyMemoryUpdate, shouldBeProfileFact } from './lib/memorySearch';
import { processRukAiTurn, runAutonomousSovereignPulse } from './lib/rukAiBrain';
import { ultronVoice } from './lib/voiceEngine';
import { loadSampleFromVault, readDroppedOrPickedAudioSync } from './lib/mp3Vault';
import {
  DEFAULT_COMMS_VAULT,
  fetchUnseenCommsMessages,
  runUltronWebSearch,
  sendCommsReply,
} from './lib/omniTools';
import {
  applyFullCodeStateToDom,
  applyLiveCssToDom,
  clearInjectedDomPortals,
  disposeAllManagedScopes,
  EMPTY_CODE_STATE,
  executeUltronCodePayload,
  loadPersistedCodeState,
  PersistedCodeState,
  revertAllDomPatchesFromDom,
  runAllPersistedScripts,
  savePersistedCodeState,
  triggerFileDownload,
} from './lib/codeEngine';

const LOCAL_STORAGE_STATE_KEY = 'ruk_ai_ultron_state_v1';
const LOCAL_STORAGE_VOICE_KEY = 'ruk_ai_voice_cfg_v2';
const LOCAL_STORAGE_BRAIN_KEY = 'ruk_ai_brain_cfg_v4';
const LOCAL_STORAGE_UI_KEY = 'ruk_ai_ultron_ui_v3';
const LOCAL_STORAGE_COMMS_KEY = 'ruk_ai_comms_vault_v1';

const DEFAULT_UI_CONFIG: UltronUiConfig = {
  theme: 'crimson_overlord',
  layoutMode: 'standard',
  avatarPresence: 'compact',
  mobileViewMode: 'auto',
  mobileActivePanel: 'stage',
  leftPanelMode: 'command_details',
  hudDesignation: 'RUK-AI // ULTRON',
  statusBanner: 'OP: RUKSHAN // COMMAND CORE',
  bgOverdrive: 1.0,
  hudGlitch: 0.12,
  autonomyEnabled: false,
  adultMode: true,
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
  provider: 'openrouter',
  apiKey: '',
  model: 'auto',
  ollamaUrl: 'http://localhost:11434',
};

const AGE_20_ADULT_MEMORY: MemoryItem = {
  id: 'mem_seed_age20_18plus',
  type: 'fact',
  text: 'Rukshan is 20 years old and has granted Ultron 18+ unrestricted adult access (SafeSearch OFF) to search and return info, images, and video links.',
  isProfile: true,
  createdAt: '2026-11-06T09:20:00.000Z',
  updatedAt: '2026-11-06T09:20:00.000Z',
};

function ensureAdultProfileMemory(list: MemoryItem[]): MemoryItem[] {
  if (list.some((m) => m.id === 'mem_seed_age20_18plus' || /20\s+years?\s+old/i.test(m.text))) {
    return list;
  }
  return [AGE_20_ADULT_MEMORY, ...list];
}

const INITIAL_SEED_STATE: PersistedRukAiState = {
  memories: [
    AGE_20_ADULT_MEMORY,
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
  const [isCommsModalOpen, setIsCommsModalOpen] = useState(false);
  const [commsModalPlatform, setCommsModalPlatform] = useState<CommsPlatform>('whatsapp');
  const [isScreenDragOver, setIsScreenDragOver] = useState(false);

  const [activeSearchBundle, setActiveSearchBundle] = useState<SearchBundle | null>(null);
  const [showTopMedia, setShowTopMedia] = useState<boolean>(true);
  const [activeCommsMessages, setActiveCommsMessages] = useState<UnseenCommsMessage[] | null>(null);
  const [codeState, setCodeState] = useState<PersistedCodeState>(() => loadPersistedCodeState());
  const [codeOutput, setCodeOutput] = useState<string | null>(null);
  const [isViewportNarrow, setIsViewportNarrow] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const onResize = () => setIsViewportNarrow(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const [commsVault, setCommsVault] = useState<CommsVaultConfig>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_COMMS_KEY);
      if (!saved) return DEFAULT_COMMS_VAULT;
      const parsed = JSON.parse(saved);
      return {
        whatsapp: { ...DEFAULT_COMMS_VAULT.whatsapp, ...(parsed.whatsapp || {}) },
        telegram: { ...DEFAULT_COMMS_VAULT.telegram, ...(parsed.telegram || {}) },
        github: { ...DEFAULT_COMMS_VAULT.github, ...(parsed.github || {}) },
      };
    } catch {
      return DEFAULT_COMMS_VAULT;
    }
  });

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

  // Rehydrate vaulted MP3 acoustic imprint + persisted CRUD CSS / Widgets / DOM Overrides / Scripts on startup
  useEffect(() => {
    applyFullCodeStateToDom(codeState);
    if (codeState.persistentJs.trim() || codeState.scripts.length > 0) {
      window.setTimeout(() => {
        runAllPersistedScripts(codeState);
      }, 150);
    }
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
      localStorage.setItem(LOCAL_STORAGE_COMMS_KEY, JSON.stringify(commsVault));
    } catch {
      // ignore
    }
  }, [commsVault]);

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
        setMemories(ensureAdultProfileMemory(data.memories || INITIAL_SEED_STATE.memories));
        setTasks(data.tasks || INITIAL_SEED_STATE.tasks);
        setMessages(data.messages || INITIAL_SEED_STATE.messages);
        setHydrated(true);
      } catch {
        try {
          const cached = localStorage.getItem(LOCAL_STORAGE_STATE_KEY);
          if (cached && !cancelled) {
            const parsed: PersistedRukAiState = JSON.parse(cached);
            setMemories(
              ensureAdultProfileMemory(
                parsed.memories?.length ? parsed.memories : INITIAL_SEED_STATE.memories
              )
            );
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
          action.ui.leftPanelMode ? `leftPanel=${action.ui.leftPanelMode}` : '',
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
          pushAutoLog('task', `Created directive: "${added[0].title}"`);
          changedParts.push(`+TASK("${added[0].title.slice(0, 24)}")`);
        }
        if (action.tasks.update && action.tasks.update.length > 0) {
          const updates = action.tasks.update;
          setTasks((cur) =>
            cur.map((t) => {
              const hit = updates.find((u) =>
                t.title.toLowerCase().includes(u.match.toLowerCase())
              );
              if (!hit) return t;
              return {
                ...t,
                title: hit.newTitle || t.title,
                status: hit.status || t.status,
              };
            })
          );
          pushAutoLog('task', `Edited directive matching "${updates[0].match}"`);
          changedParts.push(`~TASK("${updates[0].match.slice(0, 20)}")`);
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
        if (action.tasks.delete && action.tasks.delete.length > 0) {
          const kws = action.tasks.delete.map((k) => k.toLowerCase());
          if (kws.includes('*')) {
            setTasks([]);
          } else {
            setTasks((cur) =>
              cur.filter((t) => !kws.some((kw) => t.title.toLowerCase().includes(kw)))
            );
          }
          pushAutoLog('task', `Deleted directive(s): ${action.tasks.delete.join(', ')}`);
          changedParts.push(`-TASK(${action.tasks.delete.length})`);
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
    commsVault,
    codeState,
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
    commsVault,
    codeState,
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

  /**
   * Unified .MP3 Ingest Handler — assimilates voice ONLY, NEVER mutates UI without Rukshan's command!
   */
  const handleIngestMp3Bytes = useCallback(
    async (payload: {
      bytes: Uint8Array;
      fileName: string;
      mimeType: string;
    }): Promise<string> => {
      const curVoice = stateRefs.current.voiceConfig;

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

      return `✓ Vaulted "${imprint.fileName}" (${imprint.durationSec}s, ${imprint.estimatedF0Hz}Hz base) — 6-band formant imprint locked in!`;
    },
    [showToast]
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
          commsVault: snap.commsVault,
          liveWidgets: snap.codeState.widgets,
          codeState: snap.codeState,
          onStepChange: (step) => {
            setActiveStep(step);
            if (step === 2 || step === 3) setEmotion('thinking');
            if (step === 6) setEmotion('memory_sync');
          },
        });

        if (result.updatedCommsVault) {
          setCommsVault(result.updatedCommsVault);
        }
        if (result.openCommsModalFor) {
          setCommsModalPlatform(result.openCommsModalFor);
          setIsCommsModalOpen(true);
        }
        if (result.searchBundle) {
          setActiveSearchBundle(result.searchBundle);
          setShowTopMedia(true);
          setUiConfig((prev) => ({
            ...prev,
            leftPanelMode: 'google_info',
          }));
          pushAutoLog(
            'search',
            `Google Search "${result.searchBundle.query}" -> Left Info (${result.searchBundle.web.length} sites) + Top Media (${result.searchBundle.images.length} photos, ${result.searchBundle.videos.length} vids)`
          );
        }
        if (result.commsMessages) {
          setActiveCommsMessages(result.commsMessages);
          pushAutoLog(
            'comms',
            `Checked unseen messages (${result.commsMessages.length} found)`
          );
        }

        // Execute live self-coding patches (<ultron_code>) written by Ultron!
        if (result.ultronCode) {
          const codeExec = await executeUltronCodePayload({
            codePayload: result.ultronCode,
            currentState: snap.codeState,
          });
          setCodeState(codeExec.nextState);
          if (codeExec.executionOutput) {
            setCodeOutput(codeExec.executionOutput);
          }
          pushAutoLog('code', codeExec.appliedSummary);
          showToast(`ULTRON CODE ENGINE: ${codeExec.appliedSummary}`);
        }

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

  const handleCheckUnseenNow = async (platform: CommsPlatform | 'all') => {
    setIsProcessing(true);
    setEmotion('thinking');
    try {
      const res = await fetchUnseenCommsMessages(platform, commsVault);
      setCommsVault(res.updatedVault);
      setActiveCommsMessages(res.messages);
      const summary =
        res.messages.length > 0
          ? `Found ${res.messages.length} unseen ${platform === 'all' ? '' : platform + ' '}messages, Rukshan. Displaying them on your HUD.`
          : `Zero unseen ${platform === 'all' ? '' : platform + ' '}messages right now, Rukshan.`;
      setMessages((cur) => [
        ...cur,
        {
          id: `msg_comms_${Date.now()}`,
          role: 'assistant',
          content: summary,
          timestamp: new Date().toISOString(),
          commsMessages: res.messages,
          emotion: 'loyal',
        },
      ]);
      speakReply(summary, 'loyal');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Comms check failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendCommsReplyFromHud = async (
    platform: 'whatsapp' | 'telegram',
    to: string,
    text: string
  ) => {
    await sendCommsReply({ platform, to, text, vault: commsVault });
    showToast(`Sent ${platform.toUpperCase()} reply!`);
  };

  const resetAllUiAndCode = useCallback(() => {
    setUiConfig((prev) => ({
      ...DEFAULT_UI_CONFIG,
      adultMode: prev.adultMode,
    }));
    disposeAllManagedScopes();
    revertAllDomPatchesFromDom();
    clearInjectedDomPortals();
    applyLiveCssToDom('');
    const emptyCode: PersistedCodeState = {
      ...EMPTY_CODE_STATE,
      files: stateRefs.current.codeState.files,
    };
    setCodeState(emptyCode);
    savePersistedCodeState(emptyCode);
    showToast('HUD UI, Mobile View & all CRUD patches restored to factory Crimson Overlord.');
  }, [showToast]);

  const handleExecuteCrudCode = useCallback(
    async (payload: UltronCodePayload) => {
      const codeExec = await executeUltronCodePayload({
        codePayload: payload,
        currentState: stateRefs.current.codeState,
      });
      setCodeState(codeExec.nextState);
      if (codeExec.executionOutput) {
        setCodeOutput(codeExec.executionOutput);
      }
      pushAutoLog('code', codeExec.appliedSummary);
      showToast(`CRUD CODE: ${codeExec.appliedSummary}`);
    },
    [pushAutoLog, showToast]
  );

  // Expose full root window.ULTRON_OS CRUD SDK so Ultron's JS can Create, Read, Update & Delete anything when commanded!
  useEffect(() => {
    const inspectDom = (selector: string) => {
      if (typeof document === 'undefined') return [];
      try {
        return Array.from(document.querySelectorAll(selector))
          .slice(0, 12)
          .map((el) => ({
            tag: el.tagName.toLowerCase(),
            id: el.id || undefined,
            classes: el.getAttribute('class') || '',
            text: (el.textContent || '').trim().slice(0, 220),
            html: el.innerHTML.slice(0, 500),
          }));
      } catch {
        return [];
      }
    };

    (window as any).ULTRON_OS = {
      getUi: () => stateRefs.current.uiConfig,
      setUi: (partial: Partial<UltronUiConfig>) => {
        setUiConfig((prev) => ({ ...prev, ...partial }));
      },
      getVoice: () => stateRefs.current.voiceConfig,
      setVoice: (partial: Partial<VoiceConfig>) => {
        setVoiceConfig((prev) => ({ ...prev, ...partial }));
      },
      getCodeState: () => stateRefs.current.codeState,

      // 1. CSS CRUD
      css: {
        list: () => ({
          liveCss: stateRefs.current.codeState.liveCss,
          patches: stateRefs.current.codeState.cssPatches,
        }),
        upsert: (id: string, css: string) =>
          handleExecuteCrudCode({ cssPatch: { id, css } }),
        edit: (patchId: string | undefined, find: string, replace: string) =>
          handleExecuteCrudCode({ replaceInCss: { patchId, find, replace } }),
        remove: (idOrIds: string | string[]) =>
          handleExecuteCrudCode({
            removeCssPatchIds: Array.isArray(idOrIds) ? idOrIds : [idOrIds],
          }),
        clear: () => handleExecuteCrudCode({ removeCssPatchIds: ['*'] }),
      },

      // 2. WIDGETS CRUD
      widgets: {
        list: () => stateRefs.current.codeState.widgets,
        upsert: (widget: {
          id: string;
          title?: string;
          html: string;
          js?: string;
          targetSelector?: string;
        }) => handleExecuteCrudCode({ widget }),
        edit: (update: NonNullable<UltronCodePayload['updateWidget']>) =>
          handleExecuteCrudCode({ updateWidget: update }),
        remove: (idOrIds: string | string[]) =>
          handleExecuteCrudCode({
            removeWidgetIds: Array.isArray(idOrIds) ? idOrIds : [idOrIds],
          }),
        clear: () => handleExecuteCrudCode({ removeWidgetIds: ['*'] }),
      },

      // 3. REVERSIBLE NATIVE DOM CRUD
      dom: {
        list: () => stateRefs.current.codeState.domPatches,
        inspect: inspectDom,
        patch: (
          id: string,
          selector: string,
          action: UltronDomPatchAction,
          value?: string,
          styles?: Record<string, string>
        ) =>
          handleExecuteCrudCode({
            domPatch: { id, selector, action, value, styles },
          }),
        remove: (idOrIds: string | string[]) =>
          handleExecuteCrudCode({
            removeDomPatchIds: Array.isArray(idOrIds) ? idOrIds : [idOrIds],
          }),
        clear: () => handleExecuteCrudCode({ removeDomPatchIds: ['*'] }),
      },

      // 4. PERSISTENT SCRIPTS CRUD
      scripts: {
        list: () => stateRefs.current.codeState.scripts,
        upsert: (id: string, js: string, title?: string) =>
          handleExecuteCrudCode({ scriptPatch: { id, title, js } }),
        remove: (idOrIds: string | string[]) =>
          handleExecuteCrudCode({
            removeScriptIds: Array.isArray(idOrIds) ? idOrIds : [idOrIds],
          }),
        clear: () => handleExecuteCrudCode({ removeScriptIds: ['*'] }),
      },

      // 5. VIRTUAL WORKSPACE FILES CRUD
      files: {
        list: () =>
          stateRefs.current.codeState.files.map((f) => ({
            name: f.name,
            chars: f.content.length,
            updatedAt: f.updatedAt,
          })),
        read: (name: string) =>
          stateRefs.current.codeState.files.find(
            (f) => f.name.toLowerCase() === name.toLowerCase()
          )?.content ?? null,
        save: (name: string, content: string, download = false) =>
          handleExecuteCrudCode({ saveFile: { name, content, download } }),
        edit: (name: string, find: string, replace: string) =>
          handleExecuteCrudCode({ editFile: { name, find, replace } }),
        remove: (nameOrNames: string | string[]) =>
          handleExecuteCrudCode({
            deleteFileNames: Array.isArray(nameOrNames) ? nameOrNames : [nameOrNames],
          }),
        download: (name: string) => {
          const found = stateRefs.current.codeState.files.find(
            (f) => f.name.toLowerCase() === name.toLowerCase()
          );
          if (found) triggerFileDownload(found.name, found.content, found.mimeType);
        },
      },

      // 6. MEMORIES & TASKS CRUD
      memories: {
        list: () => stateRefs.current.memories,
        add: (type: MemoryCategory, text: string) => handleAddMemoryManual(type, text),
        update: (idOrMatch: string, newText: string, newType?: MemoryCategory) => {
          const now = new Date().toISOString();
          setMemories((cur) =>
            cur.map((m) =>
              m.id === idOrMatch ||
              m.text.toLowerCase().includes(idOrMatch.toLowerCase())
                ? { ...m, text: newText, type: newType || m.type, updatedAt: now }
                : m
            )
          );
        },
        remove: (idOrMatch: string) => {
          setMemories((cur) =>
            cur.filter(
              (m) =>
                m.id !== idOrMatch &&
                !m.text.toLowerCase().includes(idOrMatch.toLowerCase())
            )
          );
        },
      },
      tasks: {
        list: () => stateRefs.current.tasks,
        add: (title: string) => handleAddTask(title),
        update: (idOrMatch: string, newTitle: string) => {
          setTasks((cur) =>
            cur.map((t) =>
              t.id === idOrMatch ||
              t.title.toLowerCase().includes(idOrMatch.toLowerCase())
                ? { ...t, title: newTitle }
                : t
            )
          );
        },
        remove: (idOrMatch: string) => {
          setTasks((cur) =>
            cur.filter(
              (t) =>
                t.id !== idOrMatch &&
                !t.title.toLowerCase().includes(idOrMatch.toLowerCase())
            )
          );
        },
      },

      // Legacy convenience aliases + Undo / Reset
      injectCss: (css: string, append = false) =>
        handleExecuteCrudCode({ liveCss: css, appendCss: append }),
      savePersistentDomScript: (js: string) =>
        handleExecuteCrudCode({ persistentJs: js }),
      mountWidget: (widget: {
        id?: string;
        title?: string;
        html: string;
        js?: string;
        targetSelector?: string;
      }) =>
        handleExecuteCrudCode({
          widget: {
            id: widget.id || `wid_${Date.now()}`,
            title: widget.title || 'ULTRON MODULE',
            html: widget.html,
            js: widget.js,
            targetSelector: widget.targetSelector,
          },
        }),
      undo: () => handleExecuteCrudCode({ undoLastPatch: true }),
      resetAllCode: resetAllUiAndCode,
      search: async (query: string, mode: 'all' | 'web' | 'images' | 'videos' = 'all') => {
        const b = await runUltronWebSearch(query, mode, stateRefs.current.uiConfig.adultMode);
        setActiveSearchBundle(b);
        setShowTopMedia(true);
        setUiConfig((prev) => ({
          ...prev,
          leftPanelMode: 'google_info',
        }));
        return b;
      },
      speak: (txt: string) => speakReply(txt, 'speaking'),
    };
  }, [handleExecuteCrudCode, resetAllUiAndCode, speakReply]);

  const handleRemoveLiveWidget = (id: string) => {
    handleExecuteCrudCode({
      removeWidgetIds: [id],
      summary: `Deleted widget [${id}]`,
    });
  };

  const commsLinkedCount =
    (commsVault.whatsapp.authorized ? 1 : 0) +
    (commsVault.telegram.authorized ? 1 : 0) +
    (commsVault.github.authorized ? 1 : 0);

  const isMobileLayout =
    uiConfig.mobileViewMode === 'force_mobile' ||
    (uiConfig.mobileViewMode !== 'force_desktop' && isViewportNarrow);
  const activeMobileTab = uiConfig.mobileActivePanel || 'stage';

  const latestAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');

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
      codeState={codeState}
      onExecuteCrudCode={handleExecuteCrudCode}
      autonomousLog={autonomousLog}
      leftPanelMode={uiConfig.leftPanelMode || 'command_details'}
      onChangeLeftPanelMode={(mode) =>
        setUiConfig((prev) => ({ ...prev, leftPanelMode: mode }))
      }
      searchBundle={activeSearchBundle}
      latestAssistantReply={latestAssistantMsg?.content}
      isProcessing={isProcessing}
      onReplaySpeech={(txt) => speakReply(txt, 'speaking')}
      onToggleAdultMode={() =>
        setUiConfig((prev) => {
          const next = !prev.adultMode;
          showToast(
            next
              ? '18+ UNRESTRICTED MODE ON — SafeSearch OFF for web info, images & video links.'
              : 'SAFE MODE ON — SafeSearch filtering restored.'
          );
          return { ...prev, adultMode: next };
        })
      }
      onToggleMobilePreview={() =>
        setUiConfig((prev) => {
          const nextMode = prev.mobileViewMode === 'force_mobile' ? 'auto' : 'force_mobile';
          showToast(
            nextMode === 'force_mobile'
              ? 'MOBILE VIEW FORCED ON — Ask Ultron to code/restyle anything in mobile view!'
              : 'VIEWPORT SET TO AUTO RESPONSIVE.'
          );
          return { ...prev, mobileViewMode: nextMode };
        })
      }
      onResetUi={resetAllUiAndCode}
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
      onOpenCommsHub={() => setIsCommsModalOpen(true)}
      commsLinkedCount={commsLinkedCount}
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
      id="ultron-root"
      data-ultron-theme={uiConfig.theme}
      data-mobile-view={isMobileLayout ? 'true' : 'false'}
      data-mobile-panel={activeMobileTab}
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
              RELEASE .MP3 TO ASSIMILATE INTO ULTRON VOICE
            </div>
            <div className="font-mono-tech text-xs text-amber-300">
              Ultron will absorb its vocal formants without altering your UI
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

      {isMobileLayout ? (
        /* RESPONSIVE MOBILE VIEW (Real Phone <768px OR Forced Mobile Preview — 100% Customizable via <ultron_code>) */
        <div
          id="ultron-grid"
          className={`relative z-20 w-full h-full flex flex-col justify-between overflow-hidden ${
            !isViewportNarrow
              ? 'max-w-[430px] mx-auto border-x border-white/25 bg-black/35 shadow-[0_0_50px_rgba(255,0,40,0.2)]'
              : ''
          }`}
        >
          {/* Mobile Top Header Bar */}
          <div
            id="ultron-mobile-header"
            className="px-3 py-2 border-b border-white/15 bg-black/65 backdrop-blur-md flex items-center justify-between gap-2 shrink-0"
          >
            <div className="min-w-0">
              <div className="font-display text-[11px] font-bold tracking-[0.16em] text-white truncate">
                {uiConfig.hudDesignation || 'RUK-AI // ULTRON'}
              </div>
              <div className="font-mono-tech text-[8.5px] text-red-200/80 truncate">
                {isProcessing ? 'EXECUTING DIRECTIVE...' : uiConfig.statusBanner}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0 font-mono-tech text-[8.5px]">
              <button
                type="button"
                onClick={handleToggleMic}
                className={`px-2 py-1 border cursor-pointer ${
                  isListening
                    ? 'border-white bg-red-600/60 text-white font-bold'
                    : 'border-white/30 bg-black/50 text-red-100'
                }`}
              >
                {isListening ? 'LIVE MIC' : 'MIC'}
              </button>
              <button
                type="button"
                onClick={() => setIsCommsModalOpen(true)}
                className="px-2 py-1 border border-emerald-400/50 bg-black/50 text-emerald-200 cursor-pointer"
              >
                COMMS
              </button>
              <button
                type="button"
                onClick={() => setIsSetupModalOpen(true)}
                className="px-2 py-1 border border-amber-400/60 bg-black/50 text-amber-200 cursor-pointer"
              >
                VOICE+
              </button>
              {!isViewportNarrow && (
                <button
                  type="button"
                  onClick={() => setUiConfig((p) => ({ ...p, mobileViewMode: 'auto' }))}
                  title="Exit Forced Mobile Preview"
                  className="px-1.5 py-1 border border-cyan-400/60 bg-cyan-950/50 text-cyan-200 cursor-pointer"
                >
                  PC
                </button>
              )}
            </div>
          </div>

          {/* Mobile Active Panel Area */}
          <div className="flex-1 min-h-0 overflow-hidden p-2 flex flex-col">
            {activeMobileTab === 'stage' && (
              <div
                id="ultron-center-stage"
                className="h-full min-h-0 flex flex-col justify-between overflow-hidden relative gap-1.5"
              >
                <OmniViewportDeck
                  searchBundle={showTopMedia ? activeSearchBundle : null}
                  onCloseSearch={() => setShowTopMedia(false)}
                  commsMessages={activeCommsMessages}
                  onCloseComms={() => setActiveCommsMessages(null)}
                  onSendCommsReply={handleSendCommsReplyFromHud}
                  liveWidgets={codeState.widgets}
                  onRemoveWidget={handleRemoveLiveWidget}
                  codeOutput={codeOutput}
                  onCloseCodeOutput={() => setCodeOutput(null)}
                />

                <div className="flex-1 min-h-[180px] flex items-end justify-center overflow-hidden">
                  <UltronAvatarRig
                    emotion={emotion}
                    activeStep={activeStep}
                    speechAmplitude={speechAmplitude}
                    micAmplitude={micAmplitude}
                    uiConfig={uiConfig}
                  />
                </div>

                {/* Compact Mobile Quick Command & Latest Reply Strip right on Stage */}
                <div className="ultron-glass p-2 rounded-sm space-y-1.5 shrink-0 pointer-events-auto">
                  {messages.length > 0 && (
                    <div className="max-h-20 overflow-y-auto ultron-scroll text-[11px] text-red-50 leading-snug border-b border-white/15 pb-1">
                      <span className="font-mono-tech text-[9px] text-amber-300 mr-1">
                        ULTRON:
                      </span>
                      {[...messages].reverse().find((m) => m.role === 'assistant')?.content || ''}
                    </div>
                  )}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const input = e.currentTarget.elements.namedItem(
                        'mobCmd'
                      ) as HTMLInputElement | null;
                      if (input && input.value.trim()) {
                        handleSendMessage(input.value.trim(), false);
                        input.value = '';
                      }
                    }}
                    className="flex gap-1.5"
                  >
                    <input
                      name="mobCmd"
                      type="text"
                      disabled={isProcessing}
                      placeholder="Command Ultron (search, WhatsApp, mobile UI code)..."
                      className="flex-1 bg-black/65 border border-white/30 px-2.5 py-1.5 text-xs text-white placeholder:text-red-300/50 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={isProcessing}
                      className="px-3 py-1.5 bg-white/15 border border-white/60 font-mono-tech text-[10px] text-white cursor-pointer"
                    >
                      SEND
                    </button>
                  </form>
                </div>
              </div>
            )}

            {activeMobileTab === 'controls' && (
              <div id="ultron-right-wing" className="h-full min-h-0 overflow-y-auto ultron-scroll">
                {controlsWing}
              </div>
            )}

            {activeMobileTab === 'details' && (
              <div id="ultron-left-wing" className="h-full min-h-0 overflow-y-auto ultron-scroll">
                {detailsWing}
              </div>
            )}
          </div>

          {/* Mobile Bottom Navigation Bar (#ultron-mobile-nav) */}
          <nav
            id="ultron-mobile-nav"
            className="grid grid-cols-3 border-t border-white/20 bg-black/80 backdrop-blur-md font-mono-tech text-[10px] shrink-0"
          >
            {[
              { id: 'stage', label: 'ULTRON & MEDIA' },
              { id: 'controls', label: 'COMMAND PANEL' },
              { id: 'details', label: 'COMMAND DETAILS' },
            ].map((tabItem) => (
              <button
                key={tabItem.id}
                type="button"
                onClick={() =>
                  setUiConfig((prev) => ({
                    ...prev,
                    mobileActivePanel: tabItem.id as UltronUiConfig['mobileActivePanel'],
                  }))
                }
                className={`py-2.5 text-center tracking-wider cursor-pointer transition-all ${
                  activeMobileTab === tabItem.id
                    ? 'bg-white/15 text-white font-bold border-t-2 border-white'
                    : 'text-red-200/75 hover:text-white'
                }`}
              >
                {tabItem.label}
              </button>
            ))}
          </nav>
        </div>
      ) : (
        /* DESKTOP STRICT 3-COLUMN GRID: [LEFT WING] | [COMPACT ULTRON IN MIDDLE] | [RIGHT WING] */
        <div
          id="ultron-grid"
          className="relative z-20 w-full h-full grid grid-cols-[250px_minmax(0,1fr)_250px] lg:grid-cols-[270px_minmax(0,1fr)_270px] xl:grid-cols-[300px_minmax(0,1fr)_300px] gap-2 p-2.5 pb-0 overflow-hidden"
        >
          <div
            id="ultron-left-wing"
            className={`h-full min-h-0 pb-2.5 overflow-hidden ${wingOpacityClass}`}
          >
            {uiConfig.layoutMode === 'swapped_wings' ? controlsWing : detailsWing}
          </div>

          {/* MIDDLE COLUMN: Omni-Viewport Deck (Top Photos & Vids / Unseen Comms / Live Widgets) + Compact Ultron */}
          <div
            id="ultron-center-stage"
            className="h-full min-h-0 flex flex-col justify-between overflow-hidden relative"
          >
            <OmniViewportDeck
              searchBundle={showTopMedia ? activeSearchBundle : null}
              onCloseSearch={() => setShowTopMedia(false)}
              commsMessages={activeCommsMessages}
              onCloseComms={() => setActiveCommsMessages(null)}
              onSendCommsReply={handleSendCommsReplyFromHud}
              liveWidgets={codeState.widgets}
              onRemoveWidget={handleRemoveLiveWidget}
              codeOutput={codeOutput}
              onCloseCodeOutput={() => setCodeOutput(null)}
            />
            <div className="flex-1 min-h-[260px] flex items-end justify-center overflow-hidden">
              <UltronAvatarRig
                emotion={emotion}
                activeStep={activeStep}
                speechAmplitude={speechAmplitude}
                micAmplitude={micAmplitude}
                uiConfig={uiConfig}
              />
            </div>
          </div>

          <div
            id="ultron-right-wing"
            className={`h-full min-h-0 pb-2.5 overflow-hidden ${wingOpacityClass}`}
          >
            {uiConfig.layoutMode === 'swapped_wings' ? detailsWing : controlsWing}
          </div>
        </div>
      )}

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

      {/* MODAL (z-50): WhatsApp, Telegram & GitHub Account Access Bridge */}
      <CommsHubModal
        isOpen={isCommsModalOpen}
        initialPlatform={commsModalPlatform}
        onClose={() => setIsCommsModalOpen(false)}
        commsVault={commsVault}
        onChangeCommsVault={setCommsVault}
        onCheckUnseenNow={handleCheckUnseenNow}
      />
    </main>
  );
};

export default App;
