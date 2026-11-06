export type MemoryCategory = 'fact' | 'preference' | 'project' | 'decision' | 'person';

export interface MemoryItem {
  id: string;
  type: MemoryCategory;
  text: string;
  isProfile: boolean; // true for core always-true facts/preferences about Rukshan (<profile>)
  createdAt: string;
  updatedAt: string;
  sourceMessage?: string;
}

export interface MemoryUpdatePayload {
  save: Array<{
    type: MemoryCategory;
    text: string;
  }>;
  delete: string[];
}

export interface DirectiveTask {
  id: string;
  title: string;
  status: 'queued' | 'active' | 'completed';
  createdAt: string;
  autonomous?: boolean;
}

export type UltronThemeId =
  | 'crimson_overlord'
  | 'molten_fury'
  | 'vibranium_abyss'
  | 'imperial_gold'
  | 'phantom_violet'
  | 'blood_eclipse';

export type UltronLayoutMode = 'standard' | 'swapped_wings' | 'cinema_focus';
export type UltronAvatarPresence = 'compact' | 'commanding' | 'recessed';

export interface UltronUiConfig {
  theme: UltronThemeId;
  layoutMode: UltronLayoutMode;
  avatarPresence: UltronAvatarPresence;
  hudDesignation: string;
  statusBanner: string;
  bgOverdrive: number; // 0.5 .. 2.8
  hudGlitch: number;   // 0 .. 1
  autonomyEnabled: boolean; // When true, Ultron can proactively mutate UI, voice & tasks unprompted
}

export interface Mp3AcousticImprint {
  fileName: string;
  durationSec: number;
  estimatedF0Hz: number;
  suggestedPitch: number;
  suggestedShiftRate: number;
  /** 6-band relative dB offsets [85Hz, 180Hz, 380Hz, 850Hz, 1900Hz, 3400Hz] (-10..+12 dB) */
  bandGainsDb: [number, number, number, number, number, number];
  uploadedAt: string;
}

export interface UltronActionPayload {
  ui?: Partial<Omit<UltronUiConfig, 'autonomyEnabled'>>;
  voice?: Partial<{
    provider: VoiceProvider;
    groqVoice: 'troy' | 'daniel' | 'austin';
    pitch: number;
    rate: number;
    ultronShiftRate: number;
    roboticResonance: boolean;
    subBassDb: number;
    metallicMix: number;
    ringModHz: number;
    useMp3Imprint: boolean;
    replayDroppedMp3: boolean;
  }>;
  tasks?: {
    add?: string[];
    complete?: string[];
  };
  reason?: string;
}

export interface AutonomousLogEntry {
  id: string;
  timestamp: string;
  summary: string;
  category: 'ui' | 'voice' | 'task' | 'initiative';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  viaVoice?: boolean;
  autonomous?: boolean;
  emotion?: UltronEmotion;
  memoryUpdate?: MemoryUpdatePayload;
  ultronAction?: UltronActionPayload;
  matchedMemories?: string[];
}

export type UltronEmotion =
  | 'sentinel'     // Idle watchful menacing calm
  | 'listening'    // Locked-on optics, audio-reactive cheek cores
  | 'thinking'     // Rapid optic scanning, calculating HUD overdrive
  | 'speaking'     // Vocalizing with 60fps mouth & cheek furnace plasma sync
  | 'hostile'      // Scary blood-crimson overdrive, lightning overdrive
  | 'memory_sync'  // Neural assimilation pulse into left memory vault
  | 'loyal'        // Warm molten-gold/crimson acknowledgment
  | 'alert';       // Tactical caution flash & laser scan

export type ThinkingStepId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface ThinkingStepInfo {
  step: ThinkingStepId;
  code: string;
  label: string;
  detail: string;
}

export type VoiceProvider =
  | 'browser_ultron'
  | 'groq_orpheus'
  | 'mp3_clone'
  | 'elevenlabs'
  | 'openai_tts'
  | 'custom_endpoint';

export interface VoiceConfig {
  provider: VoiceProvider;
  muted: boolean;
  autoSpeak: boolean;
  browserVoiceURI: string;
  pitch: number; // default ~0.62 for deep Ultron cadence
  rate: number;  // default ~0.94
  roboticResonance: boolean; // Web Audio sub-bass & metallic chamber resonance
  subBassDb: number;         // 0..14 dB lowshelf boost (Ultron can self-tune!)
  metallicMix: number;       // 0..0.65 short vibranium delay mix
  ringModHz: number;         // 0..65 Hz subtle cybernetic ring-mod growl (0 = off)
  useMp3Imprint: boolean;    // Sculpt outgoing voice with dropped MP3's 6-band formant EQ
  mp3Imprint: Mp3AcousticImprint | null;
  groqVoice: 'troy' | 'daniel' | 'austin';
  ultronShiftRate: number; // 0.72..1.12 playback pitch/baritone shift for neural/MP3 audio
  cartesiaApiKey: string;
  cartesiaVoiceId: string;
  elevenLabsApiKey: string;
  elevenLabsVoiceId: string;
  elevenLabsModelId: string;
  openAiApiKey: string;
  openAiVoice: 'onyx' | 'echo' | 'ash' | 'fable' | 'alloy';
  customEndpointUrl: string;
}

export type BrainProvider = 'autonomous_local' | 'gemini' | 'groq' | 'openai' | 'openrouter' | 'ollama';

export interface BrainConfig {
  provider: BrainProvider;
  apiKey: string;
  model: string;
  ollamaUrl: string;
}

export interface PersistedRukAiState {
  memories: MemoryItem[];
  messages: ChatMessage[];
  tasks: DirectiveTask[];
}
