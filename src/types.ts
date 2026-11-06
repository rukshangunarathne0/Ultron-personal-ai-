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
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  viaVoice?: boolean;
  emotion?: UltronEmotion;
  memoryUpdate?: MemoryUpdatePayload;
  matchedMemories?: string[];
}

export type UltronEmotion =
  | 'sentinel'     // Idle watchful menacing calm
  | 'listening'    // Locked-on optics, audio-reactive cheek cores
  | 'thinking'     // Rapid optic scanning, calculating HUD overdrive
  | 'speaking'     // Vocalizing with 60fps mouth & cheek furnace plasma sync
  | 'hostile'      // Scary blood-crimson overdrive, angled brow plates, lightning arcs
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

export type VoiceProvider = 'browser_ultron' | 'elevenlabs' | 'openai_tts' | 'custom_endpoint';

export interface VoiceConfig {
  provider: VoiceProvider;
  muted: boolean;
  autoSpeak: boolean;
  browserVoiceURI: string;
  pitch: number; // default ~0.62 for deep Ultron cadence
  rate: number;  // default ~0.94
  roboticResonance: boolean; // Web Audio sub-bass & metallic chamber resonance
  elevenLabsApiKey: string;
  elevenLabsVoiceId: string; // e.g. pNInz6obpgDQGcFmaJgB (Adam) or nPczCjzI2devNBz1zQrb (Brian)
  elevenLabsModelId: string;
  openAiApiKey: string;
  openAiVoice: 'onyx' | 'echo' | 'ash' | 'fable' | 'alloy';
  customEndpointUrl: string; // e.g. http://localhost:5002/api/tts (Piper / Coqui / Kokoro)
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
