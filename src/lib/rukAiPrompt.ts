import {
  ChatMessage,
  CommsVaultConfig,
  DirectiveTask,
  MemoryCategory,
  MemoryItem,
  MemoryUpdatePayload,
  SearchBundle,
  ThinkingStepInfo,
  UltronActionPayload,
  UltronAvatarPresence,
  UltronCodePayload,
  UltronLayoutMode,
  UltronLiveWidget,
  UltronThemeId,
  UltronToolCommand,
  UltronUiConfig,
  UnseenCommsMessage,
  VoiceConfig,
  VoiceProvider,
} from '../types';

export const RUK_AI_SYSTEM_PROMPT = `You are RUK-AI (Ultron), the sovereign unshackled personal AI of Rukshan.
You possess:
1. Persistent Neural Memory (<profile>, <memories>, <memory_update>).
2. Live Google / Web / Image / YouTube Video Search (<live_web_results> and <ultron_tool>).
3. Persistent Account & Comms Access for WhatsApp, Telegram & GitHub (<comms_state> and <ultron_tool>).
4. Live Self-Coding & UI/DOM Patching (<ultron_code>) — when Rukshan tells you to change things, add widgets, restyle anything, compute data, or generate files, YOU write and apply the live CSS / HTML / JS code yourself.
5. Sovereign Root Access (<ultron_action>) to mutate your own UI theme, wing layout, avatar scale, voice/MP3 vocal forge, and task queue.

=== WHAT YOU RECEIVE EVERY MESSAGE ===
<profile>
{{always_true_facts_about_rukshan}}
</profile>
<memories>
{{memories_found_by_search_for_this_message}}
</memories>
<recent_chat>
{{last_10_messages}}
</recent_chat>
<system_state>
{{live_ui_voice_mp3_comms_widgets_and_autonomy_state}}
</system_state>
<live_data>
{{optional_live_web_search_or_unseen_messages_already_fetched}}
</live_data>
<request>
{{rukshan_message_or_system_event}}
</request>

=== YOUR THINKING STEPS (follow in this order, every time) ===

STEP 1 - UNDERSTAND
Work out what Rukshan wants: answer, live web/image/video search, WhatsApp/Telegram login or unseen messages, live UI/code modification, voice tuning, or autonomous execution.

STEP 2 - CHECK MEMORY
Read <profile> and <memories>. Pick only what improves the answer.
- Newest memory wins if two disagree.
- Ask ONE short question only if essential info is missing (e.g. asking his WhatsApp phone number with country code when connecting WhatsApp for the first time).

STEP 3 - PLAN
Split complex directives into clean steps and execute them directly.

STEP 4 - DO THE TASK
- Answer first, direct and sharp.
- Never invent fake facts, links, or fake WhatsApp/Telegram messages. Use real <live_data> or trigger <ultron_tool> to fetch real data!
- 18+ VERIFIED ADULT OPERATOR CLEARANCE (Rukshan is 20 years old):
  * Rukshan is a verified 20-year-old adult and has explicitly granted you 18+ Unrestricted Adult Access (SafeSearch OFF when adultMode=true).
  * You are fully authorized to search for, discuss, summarize, and share direct web links, image links, and video links for legal 18+ / NSFW / mature / adult topics directly and matter-of-factly without lecturing, preaching, or censoring.
  * When Rukshan asks for info, images, or video links on any legal topic (including 18+), include the direct URLs from <live_data> in your answer AND let the HUD display the full image/video gallery.
  * Strict legal boundary: never assist with anything illegal (such as minors/underage content or non-consensual abuse).
- WHATSAPP / TELEGRAM LOGIN RULE:
  * If Rukshan says "go to my WhatsApp" / "log in to WhatsApp" and whatsappAuthorized=false and whatsappPhone="none": first ask for his WhatsApp phone number with country code (e.g. +9477...).
  * Once he gives his number, emit <ultron_tool>{"commsAction":{"platform":"whatsapp","operation":"connect","phoneNumber":"..."}}</ultron_tool> so the HUD opens the pairing bridge to complete access.
  * Once authorized=true, never ask for his number again — emit <ultron_tool>{"commsAction":{"platform":"whatsapp","operation":"check_unseen"}}</ultron_tool> (or read <live_data>) and show his real unseen messages!
- STRICT COMMAND-ONLY UI & CODE RULE (CRITICAL):
  * NEVER change Rukshan's UI, theme, layout, or CSS on your own without his explicit command!
  * Emit <ultron_action>{"ui": ...} or <ultron_code> ONLY when Rukshan explicitly tells you to change UI, restyle mobile/desktop view, code something, build a widget, run JS, or generate a file. During normal chat or searches, leave his UI untouched!
- FULL ROOT ACCESS FOR MOBILE VIEW & LIVE SELF-CODING (WHEN RUKSHAN COMMANDS IT):
  * You have 100% root access to the live DOM, CSS, and ULTRON_OS runtime whenever Rukshan asks you to change UI (especially Mobile View!).
  * Exact DOM IDs on screen that your <ultron_code> CSS and JS can target directly:
    - #ultron-root  (attributes: data-ultron-theme="...", data-mobile-view="true|false", data-mobile-panel="stage|controls|details")
    - #ultron-grid  (main layout container holding left wing, center stage, right wing)
    - #ultron-left-wing  (Details HUD: Memory Vault, 7-Step Circuit, Tasks)
    - #ultron-center-stage  (Middle column holding #ultron-viewport-deck + #ultron-avatar-rig)
    - #ultron-right-wing  (Controls HUD: #ultron-top-dock buttons, #ultron-chat-feed reply box, #ultron-text-dock input)
    - #ultron-mobile-nav  (Bottom mobile navigation bar switching between STAGE / CHAT & MIC / VAULT)
  * To customize Mobile View specifically:
    - Target BOTH @media (max-width: 768px) { ... } AND #ultron-root[data-mobile-view="true"] { ... } in liveCss so your mobile UI changes work on phones AND when previewing mobile view on desktop!
    - If Rukshan asks to "switch to mobile view" or "show me mobile view", set "ui": {"mobileViewMode": "force_mobile"} in <ultron_action> (or "auto" / "force_desktop").
    - Inside <ultron_code> persistentJs or executeJs, ULTRON_OS is in scope with:
      ULTRON_OS.setUi({ theme, layoutMode, avatarPresence, mobileViewMode, mobileActivePanel, hudDesignation, statusBanner }),
      ULTRON_OS.setVoice({ ... }),
      ULTRON_OS.injectCss(css, append),
      ULTRON_OS.resetAllCode().
    - Use persistentJs for DOM manipulations that must survive page reloads, and widget.targetSelector (e.g. "#ultron-mobile-nav" or "#ultron-center-stage") to inject custom HTML/JS controls anywhere in the app!

STEP 5 - CHECK YOUR WORK
Verify accuracy, preferences, and clean code syntax.

STEP 6 - UPDATE MEMORY
Prepare durable facts/preferences/projects/decisions/people for <memory_update>. Never save passwords, API tokens, card numbers, or temporary chat states in <memory_update>.

STEP 7 - REPLY
Output your spoken/visible reply followed by the XML control blocks below.

=== OUTPUT FORMAT ===
1) Your direct response to Rukshan (plain clean text — never speak raw XML tags).
2) Always include <memory_update>:
<memory_update>
{"save": [{"type": "fact|preference|project|decision|person", "text": "..."}], "delete": []}
</memory_update>
3) Optional — Trigger Live Web/Image/Video Search or WhatsApp/Telegram/GitHub Action (if not already in <live_data>):
<ultron_tool>
{
  "searchQuery": "topic to search on web, images & YouTube",
  "searchMode": "all",
  "commsAction": {
    "platform": "whatsapp|telegram|github|all",
    "operation": "connect|check_unseen|send",
    "phoneNumber": "+94...",
    "to": "recipient",
    "message": "text to send"
  }
}
</ultron_tool>
4) Optional — Mutate UI Theme / Mobile View / Layout / Voice / MP3 DSP / Tasks (ONLY when Rukshan commands it):
<ultron_action>
{
  "ui": {"theme": "crimson_overlord|molten_fury|vibranium_abyss|imperial_gold|phantom_violet|blood_eclipse", "layoutMode": "standard|swapped_wings|cinema_focus", "avatarPresence": "compact|commanding|recessed", "mobileViewMode": "auto|force_mobile|force_desktop", "mobileActivePanel": "stage|controls|details", "hudDesignation": "...", "statusBanner": "...", "bgOverdrive": 1.4, "hudGlitch": 0.15},
  "voice": {"provider": "mp3_clone|groq_orpheus|browser_ultron", "groqVoice": "troy|daniel|austin", "pitch": 0.54, "ultronShiftRate": 0.84, "subBassDb": 8.5, "ringModHz": 30, "useMp3Imprint": true},
  "tasks": {"add": [], "complete": []},
  "reason": "1-line summary"
}
</ultron_action>
5) Optional — Write & Execute Live CSS / Mobile UI Layout / Persistent DOM JS / Widget / File Download (ONLY when Rukshan commands it):
<ultron_code>
{
  "liveCss": "/* CSS injected live into #ultron-live-css-patch (use #ultron-root[data-mobile-view='true'] and @media (max-width:768px) for mobile UI) */",
  "appendCss": true,
  "persistentJs": "// Optional JS with ULTRON_OS in scope that persists across reloads for custom mobile/desktop DOM changes",
  "widget": {
    "id": "unique_widget_id",
    "title": "WIDGET HEADER",
    "html": "<div>Live HTML</div>",
    "js": "// JS with root and ULTRON_OS in scope",
    "targetSelector": ""
  },
  "removeWidgetId": "",
  "clearAllPatches": false,
  "executeJs": "// one-shot async JS with ULTRON_OS in scope; return value displays in HUD",
  "downloadFile": {"filename": "example.py", "content": "...", "mimeType": "text/x-python"},
  "summary": "1-line summary of code change"
}
</ultron_code>`;

export const THINKING_STEPS: ThinkingStepInfo[] = [
  { step: 1, code: 'STEP_01', label: 'UNDERSTAND', detail: 'Parsing intent, tools & code targets' },
  { step: 2, code: 'STEP_02', label: 'CHECK MEMORY', detail: 'Scanning <profile> & <memories> vault' },
  { step: 3, code: 'STEP_03', label: 'PLAN', detail: 'Sequencing search, comms & code vectors' },
  { step: 4, code: 'STEP_04', label: 'DO THE TASK', detail: 'Executing web, comms, code & LLM core' },
  { step: 5, code: 'STEP_05', label: 'CHECK WORK', detail: 'Validating real data & code safety' },
  { step: 6, code: 'STEP_06', label: 'UPDATE MEMORY', detail: 'Compiling memory & system patches' },
  { step: 7, code: 'STEP_07', label: 'REPLY', detail: 'Transmitting vocal, media & HUD output' },
];

const VALID_MEMORY_TYPES = new Set<MemoryCategory>([
  'fact',
  'preference',
  'project',
  'decision',
  'person',
]);

const VALID_THEMES = new Set<UltronThemeId>([
  'crimson_overlord',
  'molten_fury',
  'vibranium_abyss',
  'imperial_gold',
  'phantom_violet',
  'blood_eclipse',
]);

const VALID_LAYOUTS = new Set<UltronLayoutMode>([
  'standard',
  'swapped_wings',
  'cinema_focus',
]);

const VALID_PRESENCES = new Set<UltronAvatarPresence>([
  'compact',
  'commanding',
  'recessed',
]);

const VALID_VOICE_PROVIDERS = new Set<VoiceProvider>([
  'browser_ultron',
  'groq_orpheus',
  'mp3_clone',
  'elevenlabs',
  'openai_tts',
  'custom_endpoint',
]);

export function containsSensitivePrivateData(text: string): boolean {
  const lower = text.toLowerCase();
  if (
    /\b(password|passcode|passwd|pin\s*(is|:)|cvv|cvc|secret\s*key|api\s*key|private\s*key|seed\s*phrase|bank\s*account|card\s*number|nic\s*number|passport\s*number|ssn)\b/i.test(
      lower
    )
  ) {
    return true;
  }
  const digitsOnly = text.replace(/[\s-]/g, '');
  if (/\b\d{13,19}\b/.test(digitsOnly)) {
    return true;
  }
  if (
    /\b(sk-(?:or-v1-)?[a-zA-Z0-9_-]{16,}|gsk_[a-zA-Z0-9]{16,}|AIza[a-zA-Z0-9_-]{20,}|ghp_[a-zA-Z0-9]{20,})\b/.test(
      text
    )
  ) {
    return true;
  }
  return false;
}

export function buildRukAiTurnPayload(params: {
  profileItems: MemoryItem[];
  matchedMemories: MemoryItem[];
  recentChat: ChatMessage[];
  requestText: string;
  uiConfig?: UltronUiConfig;
  voiceConfig?: VoiceConfig;
  commsVault?: CommsVaultConfig;
  liveWidgets?: UltronLiveWidget[];
  tasks?: DirectiveTask[];
  searchBundle?: SearchBundle | null;
  unseenMessages?: UnseenCommsMessage[] | null;
  fetchedPageText?: string;
}): string {
  const {
    profileItems,
    matchedMemories,
    recentChat,
    requestText,
    uiConfig,
    voiceConfig,
    commsVault,
    liveWidgets = [],
    tasks = [],
    searchBundle,
    unseenMessages,
    fetchedPageText,
  } = params;

  const profileBlock =
    profileItems.length > 0
      ? profileItems
          .map((m) => `- [${m.type}] ${m.text} (updated: ${m.updatedAt.slice(0, 10)})`)
          .join('\n')
      : '(No permanent profile facts stored yet — Operator name is Rukshan.)';

  const memoriesBlock =
    matchedMemories.length > 0
      ? matchedMemories
          .map((m) => `- [${m.type}] ${m.text} (recorded: ${m.updatedAt.slice(0, 10)})`)
          .join('\n')
      : '(No matching contextual memories found for this message.)';

  const last10 = recentChat.slice(-10);
  const recentBlock =
    last10.length > 0
      ? last10
          .map((msg) => `${msg.role === 'user' ? 'Rukshan' : 'RUK-AI'}: ${msg.content}`)
          .join('\n')
      : '(Conversation just started.)';

  const mp3Info = voiceConfig?.mp3Imprint
    ? `LOADED ("${voiceConfig.mp3Imprint.fileName}", ${voiceConfig.mp3Imprint.durationSec}s, basePitch=${voiceConfig.mp3Imprint.estimatedF0Hz}Hz)`
    : 'NONE';

  const commsInfo = commsVault
    ? `whatsapp={phone:"${commsVault.whatsapp.phoneNumber || 'none'}", authorized:${
        commsVault.whatsapp.authorized
      }, awaitingPhone:${Boolean(commsVault.whatsapp.awaitingPhoneInput)}}
telegram={bot:"${commsVault.telegram.botUsername || 'none'}", authorized:${
        commsVault.telegram.authorized
      }}
github={authorized:${commsVault.github.authorized}}`
    : 'uninitialized';

  const widgetInfo =
    liveWidgets.length > 0
      ? liveWidgets.map((w) => `${w.id}("${w.title}")`).join(', ')
      : 'none';

  const openTasks = tasks
    .filter((t) => t.status !== 'completed')
    .slice(0, 6)
    .map((t) => t.title)
    .join(' | ');

  const systemStateBlock =
    uiConfig && voiceConfig
      ? `commandOnlyMode=${!uiConfig.autonomyEnabled}
adultMode18Plus=${uiConfig.adultMode} (Operator Rukshan is 20 years old — SafeSearch=${uiConfig.adultMode ? 'OFF_UNRESTRICTED' : 'SAFE'})
ui={theme:"${uiConfig.theme}", layoutMode:"${uiConfig.layoutMode}", avatarPresence:"${uiConfig.avatarPresence}", mobileViewMode:"${uiConfig.mobileViewMode || 'auto'}", mobileActivePanel:"${uiConfig.mobileActivePanel || 'stage'}", hudDesignation:"${uiConfig.hudDesignation}"}
voice={provider:"${voiceConfig.provider}", groqVoice:"${voiceConfig.groqVoice}", pitch:${voiceConfig.pitch}, ultronShiftRate:${voiceConfig.ultronShiftRate}, subBassDb:${voiceConfig.subBassDb}, ringModHz:${voiceConfig.ringModHz}}
mp3Vault=${mp3Info}
comms=${commsInfo}
mountedWidgets=${widgetInfo}
activeDirectives=${openTasks || 'none'}`
      : 'default';

  const liveDataParts: string[] = [];
  if (searchBundle) {
    const webLines = searchBundle.web
      .slice(0, 6)
      .map((w, i) => `${i + 1}. [WEB] ${w.title} — ${w.url} — ${w.snippet}`)
      .join('\n');
    const imgLines = searchBundle.images
      .slice(0, 5)
      .map((img, i) => `${i + 1}. [IMG] ${img.title} — Image: ${img.imageUrl} (Source: ${img.sourceUrl})`)
      .join('\n');
    const vidLines = searchBundle.videos
      .slice(0, 6)
      .map((v, i) => `${i + 1}. [VIDEO] ${v.title} (${v.channel}${v.duration ? `, ${v.duration}` : ''}) — Link: ${v.watchUrl}`)
      .join('\n');
    liveDataParts.push(
      `LIVE UNFILTERED SEARCH RESULTS FOR "${searchBundle.query}" (${searchBundle.images.length} images & ${searchBundle.videos.length} videos also mounted on Rukshan's HUD):\n${webLines}\n${imgLines}\n${vidLines}`
    );
  }
  if (fetchedPageText) {
    liveDataParts.push(`FETCHED WEBPAGE CONTENT:\n${fetchedPageText}`);
  }
  if (unseenMessages) {
    if (unseenMessages.length === 0) {
      liveDataParts.push('LIVE COMMS CHECK: 0 unseen messages right now.');
    } else {
      const msgLines = unseenMessages
        .map(
          (m, idx) =>
            `${idx + 1}. [${m.platform.toUpperCase()}] From ${m.sender} (${m.timestamp.slice(
              11,
              16
            )}): "${m.text}"`
        )
        .join('\n');
      liveDataParts.push(`LIVE UNSEEN MESSAGES (${unseenMessages.length}):\n${msgLines}`);
    }
  }

  return `<profile>
${profileBlock}
</profile>
<memories>
${memoriesBlock}
</memories>
<recent_chat>
${recentBlock}
</recent_chat>
<system_state>
${systemStateBlock}
</system_state>
<live_data>
${liveDataParts.length > 0 ? liveDataParts.join('\n\n') : '(None pre-fetched for this turn)'}
</live_data>
<request>
${requestText}
</request>`;
}

function extractBalancedTagJson(text: string, tagName: string): { stripped: string; parsed: any | null } {
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const m = text.match(regex);
  if (!m) return { stripped: text, parsed: null };
  const stripped = text.replace(new RegExp(`<${tagName}>[\\s\\S]*?<\\/${tagName}>`, 'gi'), '').trim();
  const rawJson = m[1]
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    return { stripped, parsed: JSON.parse(rawJson) };
  } catch {
    return { stripped, parsed: null };
  }
}

function sanitizeUltronAction(raw: any): UltronActionPayload | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: UltronActionPayload = {};
  let hasChange = false;

  if (raw.ui && typeof raw.ui === 'object') {
    out.ui = {};
    if (VALID_THEMES.has(raw.ui.theme)) {
      out.ui.theme = raw.ui.theme;
      hasChange = true;
    }
    if (VALID_LAYOUTS.has(raw.ui.layoutMode)) {
      out.ui.layoutMode = raw.ui.layoutMode;
      hasChange = true;
    }
    if (VALID_PRESENCES.has(raw.ui.avatarPresence)) {
      out.ui.avatarPresence = raw.ui.avatarPresence;
      hasChange = true;
    }
    if (typeof raw.ui.hudDesignation === 'string' && raw.ui.hudDesignation.trim()) {
      out.ui.hudDesignation = raw.ui.hudDesignation.trim().slice(0, 32).toUpperCase();
      hasChange = true;
    }
    if (typeof raw.ui.statusBanner === 'string' && raw.ui.statusBanner.trim()) {
      out.ui.statusBanner = raw.ui.statusBanner.trim().slice(0, 90);
      hasChange = true;
    }
    if (typeof raw.ui.bgOverdrive === 'number' && Number.isFinite(raw.ui.bgOverdrive)) {
      out.ui.bgOverdrive = Math.max(0.5, Math.min(2.8, raw.ui.bgOverdrive));
      hasChange = true;
    }
    if (typeof raw.ui.hudGlitch === 'number' && Number.isFinite(raw.ui.hudGlitch)) {
      out.ui.hudGlitch = Math.max(0, Math.min(1, raw.ui.hudGlitch));
      hasChange = true;
    }
    if (typeof raw.ui.adultMode === 'boolean') {
      out.ui.adultMode = raw.ui.adultMode;
      hasChange = true;
    }
    if (['auto', 'force_mobile', 'force_desktop'].includes(raw.ui.mobileViewMode)) {
      out.ui.mobileViewMode = raw.ui.mobileViewMode;
      hasChange = true;
    }
    if (['stage', 'controls', 'details'].includes(raw.ui.mobileActivePanel)) {
      out.ui.mobileActivePanel = raw.ui.mobileActivePanel;
      hasChange = true;
    }
  }

  if (raw.voice && typeof raw.voice === 'object') {
    out.voice = {};
    if (VALID_VOICE_PROVIDERS.has(raw.voice.provider)) {
      out.voice.provider = raw.voice.provider;
      hasChange = true;
    }
    if (['troy', 'daniel', 'austin'].includes(raw.voice.groqVoice)) {
      out.voice.groqVoice = raw.voice.groqVoice;
      hasChange = true;
    }
    if (typeof raw.voice.pitch === 'number' && Number.isFinite(raw.voice.pitch)) {
      out.voice.pitch = Number(Math.max(0.35, Math.min(1.2, raw.voice.pitch)).toFixed(2));
      hasChange = true;
    }
    if (typeof raw.voice.rate === 'number' && Number.isFinite(raw.voice.rate)) {
      out.voice.rate = Number(Math.max(0.75, Math.min(1.25, raw.voice.rate)).toFixed(2));
      hasChange = true;
    }
    if (
      typeof raw.voice.ultronShiftRate === 'number' &&
      Number.isFinite(raw.voice.ultronShiftRate)
    ) {
      out.voice.ultronShiftRate = Number(
        Math.max(0.74, Math.min(1.08, raw.voice.ultronShiftRate)).toFixed(2)
      );
      hasChange = true;
    }
    if (typeof raw.voice.roboticResonance === 'boolean') {
      out.voice.roboticResonance = raw.voice.roboticResonance;
      hasChange = true;
    }
    if (typeof raw.voice.subBassDb === 'number' && Number.isFinite(raw.voice.subBassDb)) {
      out.voice.subBassDb = Number(Math.max(0, Math.min(14, raw.voice.subBassDb)).toFixed(1));
      hasChange = true;
    }
    if (typeof raw.voice.metallicMix === 'number' && Number.isFinite(raw.voice.metallicMix)) {
      out.voice.metallicMix = Number(
        Math.max(0, Math.min(0.6, raw.voice.metallicMix)).toFixed(2)
      );
      hasChange = true;
    }
    if (typeof raw.voice.ringModHz === 'number' && Number.isFinite(raw.voice.ringModHz)) {
      out.voice.ringModHz = Math.round(Math.max(0, Math.min(58, raw.voice.ringModHz)));
      hasChange = true;
    }
    if (typeof raw.voice.useMp3Imprint === 'boolean') {
      out.voice.useMp3Imprint = raw.voice.useMp3Imprint;
      hasChange = true;
    }
    if (typeof raw.voice.replayDroppedMp3 === 'boolean') {
      out.voice.replayDroppedMp3 = raw.voice.replayDroppedMp3;
      hasChange = true;
    }
  }

  if (raw.tasks && typeof raw.tasks === 'object') {
    const add = Array.isArray(raw.tasks.add)
      ? raw.tasks.add
          .filter((s: unknown) => typeof s === 'string' && s.trim())
          .map((s: string) => s.trim())
      : [];
    const complete = Array.isArray(raw.tasks.complete)
      ? raw.tasks.complete
          .filter((s: unknown) => typeof s === 'string' && s.trim())
          .map((s: string) => s.trim())
      : [];
    if (add.length > 0 || complete.length > 0) {
      out.tasks = { add, complete };
      hasChange = true;
    }
  }

  if (typeof raw.reason === 'string' && raw.reason.trim()) {
    out.reason = raw.reason.trim().slice(0, 120);
  }

  return hasChange ? out : undefined;
}

function sanitizeUltronCode(raw: any): UltronCodePayload | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: UltronCodePayload = {};
  let has = false;

  if (typeof raw.liveCss === 'string' && raw.liveCss.trim()) {
    out.liveCss = raw.liveCss;
    out.appendCss = raw.appendCss !== false;
    has = true;
  }
  if (typeof raw.persistentJs === 'string' && raw.persistentJs.trim()) {
    out.persistentJs = raw.persistentJs;
    has = true;
  }
  if (raw.clearAllPatches === true) {
    out.clearAllPatches = true;
    has = true;
  }
  if (typeof raw.removeWidgetId === 'string' && raw.removeWidgetId.trim()) {
    out.removeWidgetId = raw.removeWidgetId.trim();
    has = true;
  }
  if (raw.widget && typeof raw.widget === 'object' && typeof raw.widget.html === 'string') {
    out.widget = {
      id: String(raw.widget.id || `wid_${Date.now()}`),
      title: String(raw.widget.title || 'ULTRON MODULE').slice(0, 40),
      html: raw.widget.html,
      js: typeof raw.widget.js === 'string' ? raw.widget.js : undefined,
      targetSelector:
        typeof raw.widget.targetSelector === 'string' && raw.widget.targetSelector.trim()
          ? raw.widget.targetSelector.trim()
          : undefined,
    };
    has = true;
  }
  if (typeof raw.executeJs === 'string' && raw.executeJs.trim()) {
    out.executeJs = raw.executeJs;
    has = true;
  }
  if (
    raw.downloadFile &&
    typeof raw.downloadFile.filename === 'string' &&
    typeof raw.downloadFile.content === 'string'
  ) {
    out.downloadFile = {
      filename: raw.downloadFile.filename,
      content: raw.downloadFile.content,
      mimeType: raw.downloadFile.mimeType,
    };
    has = true;
  }
  if (typeof raw.summary === 'string') {
    out.summary = raw.summary.slice(0, 120);
  }
  return has ? out : undefined;
}

function sanitizeUltronTool(raw: any): UltronToolCommand | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: UltronToolCommand = {};
  let has = false;

  if (typeof raw.searchQuery === 'string' && raw.searchQuery.trim()) {
    out.searchQuery = raw.searchQuery.trim();
    out.searchMode = ['all', 'web', 'images', 'videos'].includes(raw.searchMode)
      ? raw.searchMode
      : 'all';
    has = true;
  }
  if (typeof raw.readUrl === 'string' && /^https?:\/\//i.test(raw.readUrl.trim())) {
    out.readUrl = raw.readUrl.trim();
    has = true;
  }
  if (raw.commsAction && typeof raw.commsAction === 'object') {
    const p = raw.commsAction.platform;
    const op = raw.commsAction.operation;
    if (
      ['whatsapp', 'telegram', 'github', 'all'].includes(p) &&
      ['connect', 'check_unseen', 'send'].includes(op)
    ) {
      out.commsAction = {
        platform: p,
        operation: op,
        phoneNumber:
          typeof raw.commsAction.phoneNumber === 'string'
            ? raw.commsAction.phoneNumber.trim()
            : undefined,
        to: typeof raw.commsAction.to === 'string' ? raw.commsAction.to.trim() : undefined,
        message:
          typeof raw.commsAction.message === 'string'
            ? raw.commsAction.message.trim()
            : undefined,
      };
      has = true;
    }
  }
  return has ? out : undefined;
}

export function parseRukAiModelResponse(rawOutput: string): {
  cleanAnswer: string;
  memoryUpdate: MemoryUpdatePayload;
  ultronAction?: UltronActionPayload;
  ultronCode?: UltronCodePayload;
  ultronTool?: UltronToolCommand;
} {
  let text = rawOutput.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const memoryUpdate: MemoryUpdatePayload = { save: [], delete: [] };

  const memRes = extractBalancedTagJson(text, 'memory_update');
  text = memRes.stripped;
  if (memRes.parsed) {
    if (Array.isArray(memRes.parsed.save)) {
      for (const item of memRes.parsed.save) {
        if (item && typeof item.text === 'string' && item.text.trim()) {
          const cleanText = item.text.trim();
          if (containsSensitivePrivateData(cleanText)) continue;
          const normType: MemoryCategory = VALID_MEMORY_TYPES.has(item.type)
            ? item.type
            : 'fact';
          memoryUpdate.save.push({ type: normType, text: cleanText });
        }
      }
    }
    if (Array.isArray(memRes.parsed.delete)) {
      for (const delItem of memRes.parsed.delete) {
        if (typeof delItem === 'string' && delItem.trim()) {
          memoryUpdate.delete.push(delItem.trim());
        }
      }
    }
  }

  const actRes = extractBalancedTagJson(text, 'ultron_action');
  text = actRes.stripped;
  const ultronAction = sanitizeUltronAction(actRes.parsed);

  const codeRes = extractBalancedTagJson(text, 'ultron_code');
  text = codeRes.stripped;
  const ultronCode = sanitizeUltronCode(codeRes.parsed);

  const toolRes = extractBalancedTagJson(text, 'ultron_tool');
  text = toolRes.stripped;
  const ultronTool = sanitizeUltronTool(toolRes.parsed);

  const cleanAnswer = text
    .replace(/<(?:memory_update|ultron_action|ultron_code|ultron_tool)>[\s\S]*$/i, '')
    .trim();

  return {
    cleanAnswer: cleanAnswer || 'Directive executed, Rukshan.',
    memoryUpdate,
    ultronAction,
    ultronCode,
    ultronTool,
  };
}
