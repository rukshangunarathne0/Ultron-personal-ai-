import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BrainConfig,
  ChatMessage,
  DirectiveTask,
  MemoryCategory,
  MemoryItem,
  PersistedRukAiState,
  ThinkingStepId,
  UltronEmotion,
  VoiceConfig,
} from './types';
import { BackgroundHudSystem } from './components/BackgroundHudSystem';
import { UltronAvatarRig } from './components/UltronAvatarRig';
import { LeftDetailsHud } from './components/LeftDetailsHud';
import { RightControlHud } from './components/RightControlHud';
import { VoiceBrainModal } from './components/VoiceBrainModal';
import { applyMemoryUpdate, shouldBeProfileFact } from './lib/memorySearch';
import { processRukAiTurn } from './lib/rukAiBrain';
import { ultronVoice } from './lib/voiceEngine';

const LOCAL_STORAGE_STATE_KEY = 'ruk_ai_ultron_state_v1';
const LOCAL_STORAGE_VOICE_KEY = 'ruk_ai_voice_cfg_v1';
const LOCAL_STORAGE_BRAIN_KEY = 'ruk_ai_brain_cfg_v2';

const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  provider: 'browser_ultron',
  muted: false,
  autoSpeak: true,
  browserVoiceURI: '',
  pitch: 0.62,
  rate: 0.94,
  roboticResonance: true,
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
  model: 'llama-3.3-70b-versatile',
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
      text: 'Building Ultron Personal AI (RUK-AI) with persistent memory, voice comms, and task execution as phase 1 of a larger vision.',
      isProfile: false,
      createdAt: '2026-11-06T06:00:00.000Z',
      updatedAt: '2026-11-06T06:00:00.000Z',
    },
  ],
  tasks: [
    {
      id: 'task_seed_1',
      title: 'Initialize RUK-AI neural memory & voice core',
      status: 'active',
      createdAt: '2026-11-06T06:00:00.000Z',
    },
    {
      id: 'task_seed_2',
      title: 'Connect custom Ultron TTS voice & cloud LLM key',
      status: 'queued',
      createdAt: '2026-11-06T06:00:00.000Z',
    },
  ],
  messages: [
    {
      id: 'msg_seed_welcome',
      role: 'assistant',
      content:
        'RUK-AI online, Rukshan. Neural memory vault active. Tap MIC on the right to speak to me, or open TEXT to transmit a directive.',
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

  const [lastMatchedMemoryIds, setLastMatchedMemoryIds] = useState<string[]>([]);
  const [lastXmlPayload, setLastXmlPayload] = useState('');
  const [lastRawOutput, setLastRawOutput] = useState('');
  const [toastNotice, setToastNotice] = useState<string | null>(null);

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
    }, 3500);
  }, []);

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

  const speakReply = useCallback(
    (text: string, postSpeechEmotion: UltronEmotion = 'sentinel') => {
      if (voiceConfig.muted) {
        setEmotion(postSpeechEmotion);
        setTimeout(() => setEmotion('sentinel'), postSpeechEmotion === 'hostile' ? 5000 : 2500);
        return;
      }

      ultronVoice.speak({
        text,
        config: voiceConfig,
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
    [voiceConfig, showToast]
  );

  const stateRefs = useRef({ memories, messages, tasks, brainConfig, isProcessing });
  stateRefs.current = { memories, messages, tasks, brainConfig, isProcessing };

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

      const prevMessages = stateRefs.current.messages;
      const prevMemories = stateRefs.current.memories;
      const prevTasks = stateRefs.current.tasks;
      setMessages((cur) => [...cur, userMsg]);

      try {
        const result = await processRukAiTurn({
          requestText: text,
          allMemories: prevMemories,
          recentChat: prevMessages,
          tasks: prevTasks,
          brainConfig: stateRefs.current.brainConfig,
          onStepChange: (step) => {
            setActiveStep(step);
            if (step === 2 || step === 3) setEmotion('thinking');
            if (step === 6) setEmotion('memory_sync');
          },
        });

        const { nextMemories, addedCount, deletedCount } = applyMemoryUpdate(
          prevMemories,
          result.memoryUpdate,
          text
        );
        if (addedCount > 0 || deletedCount > 0) {
          setMemories(nextMemories);
          ultronVoice.playHudCue('memory_saved', voiceConfig.muted);
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

        if (result.emotion === 'hostile') {
          ultronVoice.playHudCue('hostile', voiceConfig.muted);
        }

        const assistantMsg: ChatMessage = {
          id: `msg_a_${Date.now()}`,
          role: 'assistant',
          content: result.answer,
          timestamp: new Date().toISOString(),
          emotion: result.emotion,
          memoryUpdate: result.memoryUpdate,
          matchedMemories: result.matchedMemories.map((m) => m.id),
        };

        setMessages((cur) => [...cur, assistantMsg]);
        setLastMatchedMemoryIds(result.matchedMemories.map((m) => m.id));
        setLastXmlPayload(result.xmlPayloadSent);
        setLastRawOutput(result.rawModelOutput);

        setIsProcessing(false);
        setActiveStep(0);

        speakReply(result.answer, result.emotion);
      } catch (err) {
        setIsProcessing(false);
        setActiveStep(0);
        setEmotion('alert');
        showToast(`Execution fault: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    },
    [speakReply, voiceConfig.muted, showToast]
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
      text: 'I am RUK-AI, your personal Ultron system, Rukshan. My memory core and vocal synthesizer are online and awaiting your command.',
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

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#030002] text-red-50">
      {/* BACK LAYER (z-0): Red & Black Scary HUD + Live Animated 7-Step Task Circuit */}
      <BackgroundHudSystem
        activeStep={activeStep}
        emotion={emotion}
        tasks={tasks}
        audioLevel={Math.max(speechAmplitude, micAmplitude)}
      />

      {/* STRICT 3-COLUMN GRID: [LEFT DETAILS] | [SMALL ULTRON IN MIDDLE] | [RIGHT CONTROLS] */}
      <div className="relative z-20 w-full h-full grid grid-cols-[250px_minmax(0,1fr)_250px] lg:grid-cols-[270px_minmax(0,1fr)_270px] xl:grid-cols-[300px_minmax(0,1fr)_300px] gap-2 p-2.5 pb-0 overflow-hidden">
        {/* LEFT COLUMN ONLY */}
        <div className="h-full min-h-0 pb-2.5 overflow-hidden">
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
            onAddMemoryManual={handleAddMemoryManual}
            onDeleteMemory={handleDeleteMemory}
            onAddTask={handleAddTask}
            onToggleTask={handleToggleTask}
            onDeleteTask={handleDeleteTask}
          />
        </div>

        {/* MIDDLE COLUMN ONLY: Compact, Clean Ultron */}
        <div className="h-full min-h-0 overflow-hidden">
          <UltronAvatarRig
            emotion={emotion}
            activeStep={activeStep}
            speechAmplitude={speechAmplitude}
            micAmplitude={micAmplitude}
          />
        </div>

        {/* RIGHT COLUMN ONLY */}
        <div className="h-full min-h-0 pb-2.5 overflow-hidden">
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
        </div>
      </div>

      {/* MODAL (z-50): Voice & Brain Configuration */}
      <VoiceBrainModal
        isOpen={isSetupModalOpen}
        onClose={() => setIsSetupModalOpen(false)}
        voiceConfig={voiceConfig}
        onChangeVoiceConfig={setVoiceConfig}
        brainConfig={brainConfig}
        onChangeBrainConfig={setBrainConfig}
        onTestVoice={handleTestVoice}
      />
    </main>
  );
};

export default App;
