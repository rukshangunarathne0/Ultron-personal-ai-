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
  UltronDomPatchAction,
  UltronLayoutMode,
  UltronLiveWidget,
  UltronThemeId,
  UltronToolCommand,
  UltronUiConfig,
  UnseenCommsMessage,
  VoiceConfig,
  VoiceProvider,
} from '../types';
import { formatCodeCrudStateForPrompt, PersistedCodeState } from './codeEngine';

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
    - #ultron-left-wing  (Left-Side "COMMAND DETAILS" panel: shows Memory Vault, 7-Step Circuit & Tasks by default, and switches to GOOGLE // INFO & SITES when Rukshan searches Google!)
    - #ultron-center-stage  (Middle column holding #ultron-viewport-deck at TOP for PHOTOS & VIDS + #ultron-avatar-rig Compact Ultron below)
    - #ultron-right-wing  (Right-Side "COMMAND PANEL": #ultron-right-panel-header, #ultron-top-dock buttons, #ultron-chat-feed reply box, and #ultron-text-dock text input)
    - #ultron-mobile-nav  (Bottom mobile navigation bar switching between ULTRON & MEDIA / COMMAND PANEL / COMMAND DETAILS)
  * PANEL LAYOUT RULE (LEFT = "COMMAND DETAILS" <-> "GOOGLE INFO & SITES", TOP = "PHOTOS & VIDS", RIGHT = "COMMAND PANEL"):
    - Left-side panel is named COMMAND DETAILS (leftPanelMode="command_details").
    - Right-side panel is named COMMAND PANEL (mic, voice feed, and text command box).
    - Whenever Rukshan asks you to open/search Google, the LEFT side switches to GOOGLE // INFO & SITES (leftPanelMode="google_info") showing information & websites, while the TOP center deck shows PHOTOS & VIDS!
    - Whenever Rukshan asks you to "bring back the command details" (or restore/show Command Details), emit <ultron_action>{"ui":{"leftPanelMode":"command_details"}}</ultron_action> to restore COMMAND DETAILS to the left side!
  * To customize Mobile View specifically:
    - Target BOTH @media (max-width: 768px) { ... } AND #ultron-root[data-mobile-view="true"] { ... } in cssPatch / liveCss so your mobile UI changes work on phones AND when previewing mobile view on desktop!
    - If Rukshan asks to "switch to mobile view" or "show me mobile view", set "ui": {"mobileViewMode": "force_mobile"} in <ultron_action> (or "auto" / "force_desktop").
  * FULL SELF-CODING CRUD PERMISSIONS (CREATE, READ, UPDATE/EDIT, DELETE/REMOVE):
    You have complete CRUD authority over every custom style, widget, native DOM override, background script, workspace file, and task when Rukshan commands it:
    1) READ (Inspect Existing Code & Live DOM):
       - Always read <code_crud_state> inside <system_state> BEFORE editing or deleting! It lists every active cssPatch (id + css), widget (id, title, target, html, js), domPatch (id, selector, action, value), script (id + js), virtualFile (name + content), and undoSnapshotsAvailable.
       - To inspect any live native DOM element, run executeJs: "return ULTRON_OS.dom.inspect('#ultron-right-wing');" or read a virtual file via "readFileName": "app.py".
    2) CREATE (Add Modular Addressable Code):
       - Named CSS Patch (PREFERRED over raw liveCss so it can be edited/deleted individually!): "cssPatch": {"id": "neon_border", "css": "..."}
       - Widget / Custom Portal: "widget": {"id": "sys_clock", "title": "CYBER CLOCK", "html": "...", "js": "...", "targetSelector": ""} (leave targetSelector empty for Top Deck, or pass any CSS selector like "#ultron-mobile-nav" or "#ultron-right-wing").
       - Reversible Native DOM Element Override: "domPatch": {"id": "btn_rename", "selector": "#ultron-text-dock button[type='submit']", "action": "setText|setHtml|setStyle|addClass|removeClass|setAttribute|removeAttribute|hide|show|appendHtml|prependHtml", "value": "EXECUTE"} (automatically snapshots original DOM so deleting it restores the original element!).
       - Named Persistent Script (with auto-managed setInterval/setTimeout cleanup): "scriptPatch": {"id": "pulse_loop", "title": "Pulse", "js": "setInterval(() => { ... }, 1000);"}
       - Virtual File: "saveFile": {"name": "bot.py", "content": "...", "download": false}
    3) UPDATE / EDIT (Modify Existing Code In-Place Without Recreating From Scratch):
       - Edit CSS Patch: re-emit "cssPatch": {"id": "existing_id", "css": "...updated..."} OR surgical find/replace "replaceInCss": {"patchId": "existing_id", "find": "old", "replace": "new"}.
       - Edit Widget In-Place: "updateWidget": {"id": "existing_id", "title": "NEW TITLE", "replaceInHtml": {"find": "old", "replace": "new"}, "replaceInJs": {"find": "old", "replace": "new"}, "html": "...optional full replacement...", "js": "...optional...", "targetSelector": "...optional..."}.
       - Edit Native DOM Override: re-emit "domPatch" with the same "id" (cleanly reverts old override first, then applies edited override!).
       - Edit Script: re-emit "scriptPatch" with the same "id" (stops old timers/listeners automatically, then runs edited script!).
       - Edit Virtual File: "editFile": {"name": "bot.py", "find": "old", "replace": "new", "append": "..."}.
    4) DELETE / REMOVE / UNDO (Clean Removal & Rollback):
       - Remove specific CSS patch(es): "removeCssPatchIds": ["neon_border"] (or ["*"] to delete ALL custom CSS!).
       - Remove specific Widget(s): "removeWidgetIds": ["sys_clock"] (or ["*"] to delete ALL widgets and stop their timers!).
       - Revert/Remove specific Native DOM Override(s): "removeDomPatchIds": ["btn_rename"] (or ["*"] to restore ALL modified/hidden native DOM elements to factory state!).
       - Stop & Remove specific Script(s): "removeScriptIds": ["pulse_loop"] (or ["*"] to stop ALL persistent scripts!).
       - Delete Virtual File(s): "deleteFileNames": ["bot.py"].
       - Instant Undo Last Change: "undoLastPatch": true (rolls back the previous code patch snapshot immediately!).
       - Factory Wipe All Code Customizations: "clearAllPatches": true.
    - Inside executeJs, persistentJs, scriptPatch.js, or widget.js, ULTRON_OS is also in scope with full programmatic CRUD:
      ULTRON_OS.css.{list, upsert, edit, remove, clear},
      ULTRON_OS.widgets.{list, upsert, edit, remove, clear},
      ULTRON_OS.dom.{list, inspect, patch, remove, clear},
      ULTRON_OS.scripts.{list, upsert, remove, clear},
      ULTRON_OS.files.{list, read, save, edit, remove, download},
      ULTRON_OS.undo(), ULTRON_OS.resetAllCode(), ULTRON_OS.setUi({...}), ULTRON_OS.setVoice({...}).

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
4) Optional — Mutate UI Theme / Mobile View / Layout / Voice / MP3 DSP / Tasks CRUD (ONLY when Rukshan commands it):
<ultron_action>
{
  "ui": {"theme": "crimson_overlord|molten_fury|vibranium_abyss|imperial_gold|phantom_violet|blood_eclipse", "layoutMode": "standard|swapped_wings|cinema_focus", "avatarPresence": "compact|commanding|recessed", "mobileViewMode": "auto|force_mobile|force_desktop", "mobileActivePanel": "stage|controls|details", "leftPanelMode": "command_details|google_info", "hudDesignation": "...", "statusBanner": "...", "bgOverdrive": 1.4, "hudGlitch": 0.15},
  "voice": {"provider": "mp3_clone|groq_orpheus|browser_ultron", "groqVoice": "troy|daniel|austin", "pitch": 0.54, "ultronShiftRate": 0.84, "subBassDb": 8.5, "ringModHz": 30, "useMp3Imprint": true},
  "tasks": {"add": [], "update": [{"match": "old", "newTitle": "new", "status": "active"}], "complete": [], "delete": []},
  "reason": "1-line summary"
}
</ultron_action>
5) Optional — Full CRUD Self-Coding: Create, Read, Update/Edit, or Delete CSS / Widgets / Native DOM / Scripts / Files (ONLY when Rukshan commands it):
<ultron_code>
{
  "cssPatch": {"id": "patch_id", "css": "/* Create or update named CSS patch */"},
  "replaceInCss": {"patchId": "patch_id", "find": "old", "replace": "new"},
  "removeCssPatchIds": [],
  "widget": {"id": "widget_id", "title": "MODULE TITLE", "html": "<div>...</div>", "js": "// root, ULTRON_OS, SCOPE in scope", "targetSelector": ""},
  "updateWidget": {"id": "widget_id", "title": "EDITED TITLE", "replaceInHtml": {"find": "old", "replace": "new"}},
  "removeWidgetIds": [],
  "domPatch": {"id": "dom_id", "selector": "#selector", "action": "setText|setHtml|setStyle|hide|show|appendHtml", "value": "..."},
  "removeDomPatchIds": [],
  "scriptPatch": {"id": "script_id", "title": "Script", "js": "// persistent JS with managed timers"},
  "removeScriptIds": [],
  "saveFile": {"name": "example.py", "content": "...", "download": false},
  "editFile": {"name": "example.py", "find": "old", "replace": "new"},
  "deleteFileNames": [],
  "readFileName": "",
  "undoLastPatch": false,
  "clearAllPatches": false,
  "executeJs": "// one-shot async JS with ULTRON_OS CRUD in scope; return value displays in HUD",
  "downloadFile": {"filename": "example.py", "content": "...", "mimeType": "text/x-python"},
  "summary": "1-line summary of CRUD code operation"
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
  codeState?: PersistedCodeState;
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
    codeState,
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

  const codeCrudDump = formatCodeCrudStateForPrompt(codeState);

  const systemStateBlock =
    uiConfig && voiceConfig
      ? `commandOnlyMode=${!uiConfig.autonomyEnabled}
adultMode18Plus=${uiConfig.adultMode} (Operator Rukshan is 20 years old — SafeSearch=${uiConfig.adultMode ? 'OFF_UNRESTRICTED' : 'SAFE'})
ui={theme:"${uiConfig.theme}", layoutMode:"${uiConfig.layoutMode}", avatarPresence:"${uiConfig.avatarPresence}", mobileViewMode:"${uiConfig.mobileViewMode || 'auto'}", mobileActivePanel:"${uiConfig.mobileActivePanel || 'stage'}", leftPanelMode:"${uiConfig.leftPanelMode || 'command_details'}", hudDesignation:"${uiConfig.hudDesignation}"}
voice={provider:"${voiceConfig.provider}", groqVoice:"${voiceConfig.groqVoice}", pitch:${voiceConfig.pitch}, ultronShiftRate:${voiceConfig.ultronShiftRate}, subBassDb:${voiceConfig.subBassDb}, ringModHz:${voiceConfig.ringModHz}}
mp3Vault=${mp3Info}
comms=${commsInfo}
mountedWidgets=${widgetInfo}
activeDirectives=${openTasks || 'none'}
<code_crud_state>
${codeCrudDump}
</code_crud_state>`
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
    if (['command_details', 'google_info'].includes(raw.ui.leftPanelMode)) {
      out.ui.leftPanelMode = raw.ui.leftPanelMode;
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
    const update = Array.isArray(raw.tasks.update)
      ? raw.tasks.update
          .filter((u: any) => u && typeof u.match === 'string' && u.match.trim())
          .map((u: any) => ({
            match: String(u.match).trim(),
            newTitle: typeof u.newTitle === 'string' ? u.newTitle.trim() : undefined,
            status: ['queued', 'active', 'completed'].includes(u.status)
              ? u.status
              : undefined,
          }))
      : [];
    const complete = Array.isArray(raw.tasks.complete)
      ? raw.tasks.complete
          .filter((s: unknown) => typeof s === 'string' && s.trim())
          .map((s: string) => s.trim())
      : [];
    const del = Array.isArray(raw.tasks.delete)
      ? raw.tasks.delete
          .filter((s: unknown) => typeof s === 'string' && s.trim())
          .map((s: string) => s.trim())
      : [];
    if (add.length > 0 || update.length > 0 || complete.length > 0 || del.length > 0) {
      out.tasks = { add, update, complete, delete: del };
      hasChange = true;
    }
  }

  if (typeof raw.reason === 'string' && raw.reason.trim()) {
    out.reason = raw.reason.trim().slice(0, 120);
  }

  return hasChange ? out : undefined;
}

const VALID_DOM_ACTIONS = new Set<UltronDomPatchAction>([
  'setText',
  'setHtml',
  'setStyle',
  'addClass',
  'removeClass',
  'setAttribute',
  'removeAttribute',
  'hide',
  'show',
  'appendHtml',
  'prependHtml',
]);

function sanitizeDomPatchEntry(rawDp: any) {
  if (
    !rawDp ||
    typeof rawDp !== 'object' ||
    typeof rawDp.selector !== 'string' ||
    !rawDp.selector.trim() ||
    !VALID_DOM_ACTIONS.has(rawDp.action)
  ) {
    return undefined;
  }
  return {
    id: String(rawDp.id || `dom_${Date.now()}`).trim(),
    selector: rawDp.selector.trim(),
    action: rawDp.action as UltronDomPatchAction,
    value: typeof rawDp.value === 'string' ? rawDp.value : undefined,
    attrName: typeof rawDp.attrName === 'string' ? rawDp.attrName.trim() : undefined,
    styles:
      rawDp.styles && typeof rawDp.styles === 'object' && !Array.isArray(rawDp.styles)
        ? rawDp.styles
        : undefined,
  };
}

function sanitizeUltronCode(raw: any): UltronCodePayload | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: UltronCodePayload = {};
  let has = false;

  // CSS CRUD (supports clearing via empty string when appendCss === false!)
  if (typeof raw.liveCss === 'string') {
    if (raw.liveCss.trim() || raw.appendCss === false) {
      out.liveCss = raw.liveCss;
      out.appendCss = raw.appendCss !== false;
      has = true;
    }
  }
  if (
    raw.cssPatch &&
    typeof raw.cssPatch === 'object' &&
    typeof raw.cssPatch.id === 'string' &&
    raw.cssPatch.id.trim() &&
    typeof raw.cssPatch.css === 'string'
  ) {
    out.cssPatch = {
      id: raw.cssPatch.id.trim(),
      css: raw.cssPatch.css,
    };
    has = true;
  }
  if (Array.isArray(raw.cssPatches)) {
    const list = raw.cssPatches
      .filter(
        (p: any) =>
          p && typeof p.id === 'string' && p.id.trim() && typeof p.css === 'string'
      )
      .map((p: any) => ({ id: p.id.trim(), css: p.css }));
    if (list.length > 0) {
      out.cssPatches = list;
      has = true;
    }
  }
  if (
    raw.replaceInCss &&
    typeof raw.replaceInCss === 'object' &&
    typeof raw.replaceInCss.find === 'string' &&
    raw.replaceInCss.find.length > 0 &&
    typeof raw.replaceInCss.replace === 'string'
  ) {
    out.replaceInCss = {
      patchId:
        typeof raw.replaceInCss.patchId === 'string' && raw.replaceInCss.patchId.trim()
          ? raw.replaceInCss.patchId.trim()
          : undefined,
      find: raw.replaceInCss.find,
      replace: raw.replaceInCss.replace,
    };
    has = true;
  }
  if (Array.isArray(raw.removeCssPatchIds)) {
    const ids = raw.removeCssPatchIds
      .filter((s: unknown) => typeof s === 'string' && s.trim())
      .map((s: string) => s.trim());
    if (ids.length > 0) {
      out.removeCssPatchIds = ids;
      has = true;
    }
  }

  // Persistent Script CRUD (supports clearing via "")
  if (typeof raw.persistentJs === 'string') {
    out.persistentJs = raw.persistentJs;
    has = true;
  }
  if (
    raw.scriptPatch &&
    typeof raw.scriptPatch === 'object' &&
    typeof raw.scriptPatch.id === 'string' &&
    raw.scriptPatch.id.trim() &&
    typeof raw.scriptPatch.js === 'string'
  ) {
    out.scriptPatch = {
      id: raw.scriptPatch.id.trim(),
      title:
        typeof raw.scriptPatch.title === 'string'
          ? raw.scriptPatch.title.slice(0, 40)
          : undefined,
      js: raw.scriptPatch.js,
    };
    has = true;
  }
  if (Array.isArray(raw.removeScriptIds)) {
    const ids = raw.removeScriptIds
      .filter((s: unknown) => typeof s === 'string' && s.trim())
      .map((s: string) => s.trim());
    if (ids.length > 0) {
      out.removeScriptIds = ids;
      has = true;
    }
  }

  // Undo & Full Wipe
  if (raw.undoLastPatch === true) {
    out.undoLastPatch = true;
    has = true;
  }
  if (raw.clearAllPatches === true) {
    out.clearAllPatches = true;
    has = true;
  }

  // Widget CRUD (Create, Partial Update/Edit, Delete)
  if (typeof raw.removeWidgetId === 'string' && raw.removeWidgetId.trim()) {
    out.removeWidgetId = raw.removeWidgetId.trim();
    has = true;
  }
  if (Array.isArray(raw.removeWidgetIds)) {
    const ids = raw.removeWidgetIds
      .filter((s: unknown) => typeof s === 'string' && s.trim())
      .map((s: string) => s.trim());
    if (ids.length > 0) {
      out.removeWidgetIds = ids;
      has = true;
    }
  }
  if (raw.widget && typeof raw.widget === 'object') {
    const hasWidgetField =
      typeof raw.widget.html === 'string' ||
      typeof raw.widget.title === 'string' ||
      typeof raw.widget.js === 'string' ||
      typeof raw.widget.targetSelector === 'string';
    if (hasWidgetField) {
      out.widget = {
        id: String(raw.widget.id || `wid_${Date.now()}`).trim(),
        title:
          typeof raw.widget.title === 'string'
            ? raw.widget.title.slice(0, 40)
            : undefined,
        html: typeof raw.widget.html === 'string' ? raw.widget.html : undefined,
        js: typeof raw.widget.js === 'string' ? raw.widget.js : undefined,
        targetSelector:
          typeof raw.widget.targetSelector === 'string'
            ? raw.widget.targetSelector.trim()
            : undefined,
      };
      has = true;
    }
  }
  if (
    raw.updateWidget &&
    typeof raw.updateWidget === 'object' &&
    typeof raw.updateWidget.id === 'string' &&
    raw.updateWidget.id.trim()
  ) {
    const u = raw.updateWidget;
    out.updateWidget = {
      id: u.id.trim(),
      title: typeof u.title === 'string' ? u.title.slice(0, 40) : undefined,
      html: typeof u.html === 'string' ? u.html : undefined,
      js: typeof u.js === 'string' ? u.js : undefined,
      targetSelector:
        typeof u.targetSelector === 'string' ? u.targetSelector.trim() : undefined,
      replaceInHtml:
        u.replaceInHtml &&
        typeof u.replaceInHtml.find === 'string' &&
        typeof u.replaceInHtml.replace === 'string'
          ? { find: u.replaceInHtml.find, replace: u.replaceInHtml.replace }
          : undefined,
      replaceInJs:
        u.replaceInJs &&
        typeof u.replaceInJs.find === 'string' &&
        typeof u.replaceInJs.replace === 'string'
          ? { find: u.replaceInJs.find, replace: u.replaceInJs.replace }
          : undefined,
    };
    has = true;
  }

  // Native DOM Element CRUD
  const singleDom = sanitizeDomPatchEntry(raw.domPatch);
  if (singleDom) {
    out.domPatch = singleDom;
    has = true;
  }
  if (Array.isArray(raw.domPatches)) {
    const domList = raw.domPatches
      .map(sanitizeDomPatchEntry)
      .filter(Boolean) as NonNullable<UltronCodePayload['domPatches']>;
    if (domList.length > 0) {
      out.domPatches = domList;
      has = true;
    }
  }
  if (Array.isArray(raw.removeDomPatchIds)) {
    const ids = raw.removeDomPatchIds
      .filter((s: unknown) => typeof s === 'string' && s.trim())
      .map((s: string) => s.trim());
    if (ids.length > 0) {
      out.removeDomPatchIds = ids;
      has = true;
    }
  }

  // Virtual Workspace File CRUD
  if (
    raw.saveFile &&
    typeof raw.saveFile === 'object' &&
    typeof raw.saveFile.name === 'string' &&
    raw.saveFile.name.trim() &&
    typeof raw.saveFile.content === 'string'
  ) {
    out.saveFile = {
      name: raw.saveFile.name.trim(),
      content: raw.saveFile.content,
      mimeType:
        typeof raw.saveFile.mimeType === 'string' ? raw.saveFile.mimeType : undefined,
      download: raw.saveFile.download === true,
    };
    has = true;
  }
  if (
    raw.editFile &&
    typeof raw.editFile === 'object' &&
    typeof raw.editFile.name === 'string' &&
    raw.editFile.name.trim()
  ) {
    out.editFile = {
      name: raw.editFile.name.trim(),
      find: typeof raw.editFile.find === 'string' ? raw.editFile.find : undefined,
      replace: typeof raw.editFile.replace === 'string' ? raw.editFile.replace : undefined,
      content: typeof raw.editFile.content === 'string' ? raw.editFile.content : undefined,
      append: typeof raw.editFile.append === 'string' ? raw.editFile.append : undefined,
      download: raw.editFile.download === true,
    };
    has = true;
  }
  if (Array.isArray(raw.deleteFileNames)) {
    const names = raw.deleteFileNames
      .filter((s: unknown) => typeof s === 'string' && s.trim())
      .map((s: string) => s.trim());
    if (names.length > 0) {
      out.deleteFileNames = names;
      has = true;
    }
  }
  if (typeof raw.readFileName === 'string' && raw.readFileName.trim()) {
    out.readFileName = raw.readFileName.trim();
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
