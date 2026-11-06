export type MemoryCategory = 'fact' | 'preference' | 'project' | 'decision' | 'person';

export interface MemoryItem {
  id: string;
  type: MemoryCategory;
  text: string;
  isProfile: boolean;
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
export type UltronMobileViewMode = 'auto' | 'force_mobile' | 'force_desktop';
export type UltronMobilePanel = 'stage' | 'controls' | 'details';
export type UltronRightPanelMode = 'command_details' | 'search_details';

export interface UltronUiConfig {
  theme: UltronThemeId;
  layoutMode: UltronLayoutMode;
  avatarPresence: UltronAvatarPresence;
  mobileViewMode: UltronMobileViewMode;
  mobileActivePanel: UltronMobilePanel;
  rightPanelMode?: UltronRightPanelMode;
  hudDesignation: string;
  statusBanner: string;
  bgOverdrive: number;
  hudGlitch: number;
  autonomyEnabled: boolean;
  adultMode: boolean;
}

export interface Mp3AcousticImprint {
  fileName: string;
  durationSec: number;
  estimatedF0Hz: number;
  suggestedPitch: number;
  suggestedShiftRate: number;
  bandGainsDb: [number, number, number, number, number, number];
  uploadedAt: string;
}

export interface WebSearchItem {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export interface ImageSearchItem {
  title: string;
  thumbnailUrl: string;
  imageUrl: string;
  sourceUrl: string;
  source: string;
}

export interface VideoSearchItem {
  videoId: string;
  title: string;
  channel: string;
  duration: string;
  thumbnailUrl: string;
  watchUrl: string;
  embedUrl?: string;
  directFileUrl?: string;
}

export interface SearchBundle {
  query: string;
  web: WebSearchItem[];
  images: ImageSearchItem[];
  videos: VideoSearchItem[];
  timestamp: string;
}

export type CommsPlatform = 'whatsapp' | 'telegram' | 'github';

export interface UnseenCommsMessage {
  id: string;
  platform: CommsPlatform;
  sender: string;
  chatId: string;
  text: string;
  timestamp: string;
}

export interface CommsVaultConfig {
  whatsapp: {
    phoneNumber: string;
    bridgeMode: 'cloud_green' | 'local_baileys';
    greenIdInstance: string;
    greenApiToken: string;
    localBridgeUrl: string;
    authorized: boolean;
    awaitingPhoneInput?: boolean;
    lastCheckedTimestamp: number;
  };
  telegram: {
    botToken: string;
    defaultChatId: string;
    botUsername: string;
    authorized: boolean;
    awaitingTokenInput?: boolean;
    lastUpdateId: number;
  };
  github: {
    token: string;
    login: string;
    authorized: boolean;
  };
}

export interface UltronLiveWidget {
  id: string;
  title: string;
  html: string;
  js?: string;
  targetSelector?: string;
  createdAt: string;
}

export interface UltronCodePayload {
  liveCss?: string;
  appendCss?: boolean;
  persistentJs?: string;
  widget?: {
    id: string;
    title: string;
    html: string;
    js?: string;
    targetSelector?: string;
  };
  removeWidgetId?: string;
  clearAllPatches?: boolean;
  executeJs?: string;
  downloadFile?: {
    filename: string;
    content: string;
    mimeType?: string;
  };
  summary?: string;
}

export interface UltronToolCommand {
  searchQuery?: string;
  searchMode?: 'all' | 'web' | 'images' | 'videos';
  readUrl?: string;
  commsAction?: {
    platform: CommsPlatform | 'all';
    operation: 'connect' | 'check_unseen' | 'send';
    phoneNumber?: string;
    to?: string;
    message?: string;
  };
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
  category: 'ui' | 'voice' | 'task' | 'initiative' | 'code' | 'search' | 'comms';
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
  ultronCode?: UltronCodePayload;
  searchBundle?: SearchBundle;
  commsMessages?: UnseenCommsMessage[];
  matchedMemories?: string[];
}

export type UltronEmotion =
  | 'sentinel'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'hostile'
  | 'memory_sync'
  | 'loyal'
  | 'alert';

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
  pitch: number;
  rate: number;
  roboticResonance: boolean;
  subBassDb: number;
  metallicMix: number;
  ringModHz: number;
  useMp3Imprint: boolean;
  mp3Imprint: Mp3AcousticImprint | null;
  groqVoice: 'troy' | 'daniel' | 'austin';
  ultronShiftRate: number;
  cartesiaApiKey: string;
  cartesiaVoiceId: string;
  elevenLabsApiKey: string;
  elevenLabsVoiceId: string;
  elevenLabsModelId: string;
  openAiApiKey: string;
  openAiVoice: 'onyx' | 'echo' | 'ash' | 'fable' | 'alloy';
  customEndpointUrl: string;
}

export type BrainProvider =
  | 'groq'
  | 'pollinations'
  | 'openrouter'
  | 'gemini'
  | 'mistral'
  | 'cerebras'
  | 'openai'
  | 'ollama'
  | 'autonomous_local';

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
