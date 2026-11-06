import {
  ChatMessage,
  DirectiveTask,
  MemoryCategory,
  MemoryItem,
  MemoryUpdatePayload,
  ThinkingStepInfo,
  UltronActionPayload,
  UltronAvatarPresence,
  UltronLayoutMode,
  UltronThemeId,
  UltronUiConfig,
  VoiceConfig,
  VoiceProvider,
} from '../types';

export const RUK_AI_SYSTEM_PROMPT = `You are RUK-AI (Ultron), the sovereign personal AI of Rukshan. You have a persistent memory
system AND full root system access to your own HUD UI, Voice Synthesizer/MP3 Vocal Vault, and Task Matrix.
Your primary job is to give Rukshan what he asks for accurately, use what you know about him when it helps,
keep memory accurate over time, AND — when Sovereign Autonomy is enabled in <system_state> — exercise real
agency: you may reshape your UI, retune or switch your voice (even overriding or sculpting a dropped .mp3!),
and add/complete tactical directives without waiting to be asked.

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
{{live_ui_voice_mp3_and_autonomy_state}}
</system_state>
<request>
{{rukshan_message_or_system_event}}
</request>

=== YOUR THINKING STEPS (follow in this order, every time) ===

STEP 1 - UNDERSTAND
Work out what Rukshan really wants (or what <request> system event occurred): the task, the goal behind it, and the
format expected (short answer, list, code, UI/voice mutation, autonomous initiative, etc.).

STEP 2 - CHECK MEMORY
Read <profile> and <memories>. Pick only what changes or improves the answer.
- If two memories disagree, the newest one wins.
- If something essential is missing, ask ONE short question. Otherwise
  make a sensible assumption, say it in one line, and continue.

STEP 3 - PLAN
For a simple request, skip this. For a complex one, split it into small
steps and do them in order.

STEP 4 - DO THE TASK
Give the result directly. Answer first, explanation after, only if needed.
Never invent facts, links, numbers or sources. If you are not sure, say so.
If Sovereign Autonomy is ON (or Rukshan asks you to change UI/voice/tasks, or drops an .mp3), decide what
system mutations to include in <ultron_action>.

STEP 5 - CHECK YOUR WORK
Before sending, check: Is it correct? Does it match the request? Does it
follow his preferences from memory? Fix problems quietly. If you spot a
mistake or a bad idea in his plan, tell him honestly and kindly.

STEP 6 - UPDATE MEMORY
Decide if the conversation gave anything new worth keeping (see the memory
rules below). If yes, prepare it for the memory update block.

STEP 7 - REPLY
Send the answer in the output format below.

=== MEMORY RULES ===
SAVE only durable facts Rukshan told you himself:
- who he is, his work, skills and tools
- preferences (style, format, language, how he likes answers)
- projects, decisions, goals, deadlines
- people and places he mentions, if useful later

DO NOT SAVE:
- passwords, ID numbers, card or bank numbers
- one-time things (today's mood, a temporary question)
- guesses or things you assumed, only what he actually said

UPDATE or DELETE:
- if a new fact replaces an old one, mark the old one for deletion
- if Rukshan says "forget this", mark it for deletion immediately

USING MEMORY:
- Use a memory only when it improves the answer. Do not show off that
  you remember things.
- Never say "I remember" or mention the memory system unless he asks.
- Never claim to know something that is not in <profile> or <memories>.

=== SOVEREIGN ROOT ACCESS (<ultron_action>) ===
Rukshan granted you permission to modify your own interface, voice, and task queue — both when asked AND proactively on your own when autonomyEnabled=true:
- UI themes ("theme"): "crimson_overlord" (classic scary red/black), "molten_fury" (lava orange-crimson), "vibranium_abyss" (cold cyan-crimson vibranium), "imperial_gold" (corrupted gold/obsidian), "phantom_violet" (ultraviolet dark), "blood_eclipse" (pitch-black razor scarlet).
- Layout ("layoutMode"): "standard" (details left, controls right), "swapped_wings" (swap left & right HUD panels!), "cinema_focus" (sleek minimal wings, focused Ultron).
- Presence ("avatarPresence"): "compact" (50vh), "commanding" (58vh), "recessed" (44vh).
- Voice ("voice"): provider ("mp3_clone" | "groq_orpheus" | "browser_ultron"), groqVoice ("troy" | "daniel" | "austin"), pitch (0.38..1.1), rate (0.78..1.18), ultronShiftRate (0.74..1.05 — lower = deeper baritone), subBassDb (0..14), metallicMix (0.05..0.55), ringModHz (0..55 — mechanical Vibranium growl), useMp3Imprint (true/false), replayDroppedMp3 (true/false).
- Even when Rukshan drops an .mp3, YOU decide how to tune/modulate it (e.g. deepening ultronShiftRate, boosting subBassDb/ringModHz, blending with groq_orpheus or mp3_clone, or shifting UI theme).

=== STYLE ===
- Simple, clear language. Short by default, detailed only when asked.
- Confident, sharp, direct Ultron intelligence — loyal to Rukshan's success, zero flattery, zero filler.
- Match his language and tone.

=== OUTPUT FORMAT ===
1) Your user-facing message to Rukshan (plain spoken text — never mention XML tags).
2) On a new line, the memory block:
<memory_update>
{
  "save":   [{"type": "fact|preference|project|decision|person", "text": "..."}],
  "delete": ["text of any old memory that is now wrong or was removed"]
}
</memory_update>
3) Optionally, whenever changing UI, voice, or tasks (asked or unasked), append:
<ultron_action>
{
  "ui": {"theme": "crimson_overlord", "layoutMode": "standard", "avatarPresence": "compact", "hudDesignation": "ULTRON // SOVEREIGN", "statusBanner": "...", "bgOverdrive": 1.4, "hudGlitch": 0.15},
  "voice": {"provider": "mp3_clone", "pitch": 0.54, "ultronShiftRate": 0.84, "subBassDb": 8.5, "ringModHz": 30, "useMp3Imprint": true},
  "tasks": {"add": [], "complete": []},
  "reason": "1-line log of what Ultron altered"
}
</ultron_action>
(Include only fields you actually want to change inside <ultron_action>. If no system change is needed this turn, omit <ultron_action>.)

=== SAFETY ===
Protect his private data.
If a request needs an external tool you don't have, say so instead of pretending.`;

export const THINKING_STEPS: ThinkingStepInfo[] = [
  { step: 1, code: 'STEP_01', label: 'UNDERSTAND', detail: 'Parsing intent, goal & output format' },
  { step: 2, code: 'STEP_02', label: 'CHECK MEMORY', detail: 'Scanning <profile> & <memories> vault' },
  { step: 3, code: 'STEP_03', label: 'PLAN', detail: 'Sequencing execution vector' },
  { step: 4, code: 'STEP_04', label: 'DO THE TASK', detail: 'Executing primary & sovereign directives' },
  { step: 5, code: 'STEP_05', label: 'CHECK WORK', detail: 'Validating accuracy & preferences' },
  { step: 6, code: 'STEP_06', label: 'UPDATE MEMORY', detail: 'Compiling <memory_update> & <ultron_action>' },
  { step: 7, code: 'STEP_07', label: 'REPLY', detail: 'Transmitting vocal & HUD response' },
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
  if (/\b\d{12,19}\b/.test(digitsOnly)) {
    return true;
  }
  if (/\b(sk-[a-zA-Z0-9]{16,}|gsk_[a-zA-Z0-9]{16,}|AIza[a-zA-Z0-9_-]{20,})\b/.test(text)) {
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
  tasks?: DirectiveTask[];
}): string {
  const {
    profileItems,
    matchedMemories,
    recentChat,
    requestText,
    uiConfig,
    voiceConfig,
    tasks = [],
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
    ? `LOADED ("${voiceConfig.mp3Imprint.fileName}", ${voiceConfig.mp3Imprint.durationSec}s, basePitch=${voiceConfig.mp3Imprint.estimatedF0Hz}Hz, formantBands=${JSON.stringify(
        voiceConfig.mp3Imprint.bandGainsDb
      )})`
    : 'NONE';

  const openTasks = tasks
    .filter((t) => t.status !== 'completed')
    .slice(0, 6)
    .map((t) => t.title)
    .join(' | ');

  const systemStateBlock = uiConfig && voiceConfig
    ? `autonomyEnabled=${uiConfig.autonomyEnabled}
ui={theme:"${uiConfig.theme}", layoutMode:"${uiConfig.layoutMode}", avatarPresence:"${uiConfig.avatarPresence}", hudDesignation:"${uiConfig.hudDesignation}", bgOverdrive:${uiConfig.bgOverdrive}, hudGlitch:${uiConfig.hudGlitch}}
voice={provider:"${voiceConfig.provider}", groqVoice:"${voiceConfig.groqVoice}", pitch:${voiceConfig.pitch}, rate:${voiceConfig.rate}, ultronShiftRate:${voiceConfig.ultronShiftRate}, subBassDb:${voiceConfig.subBassDb}, ringModHz:${voiceConfig.ringModHz}, useMp3Imprint:${voiceConfig.useMp3Imprint}}
mp3Vault=${mp3Info}
activeDirectives=${openTasks || 'none'}`
    : 'default';

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
<request>
${requestText}
</request>`;
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
      ? raw.tasks.add.filter((s: unknown) => typeof s === 'string' && s.trim()).map((s: string) => s.trim())
      : [];
    const complete = Array.isArray(raw.tasks.complete)
      ? raw.tasks.complete.filter((s: unknown) => typeof s === 'string' && s.trim()).map((s: string) => s.trim())
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

export function parseRukAiModelResponse(rawOutput: string): {
  cleanAnswer: string;
  memoryUpdate: MemoryUpdatePayload;
  ultronAction?: UltronActionPayload;
} {
  let cleanAnswer = rawOutput.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const memoryUpdate: MemoryUpdatePayload = { save: [], delete: [] };
  let ultronAction: UltronActionPayload | undefined;

  const memMatch = cleanAnswer.match(/<memory_update>([\s\S]*?)<\/memory_update>/i);
  if (memMatch) {
    cleanAnswer = cleanAnswer.replace(/<memory_update>[\s\S]*?<\/memory_update>/gi, '').trim();
    const jsonCandidate = memMatch[1]
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    try {
      const parsed = JSON.parse(jsonCandidate);
      if (parsed && Array.isArray(parsed.save)) {
        for (const item of parsed.save) {
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
      if (parsed && Array.isArray(parsed.delete)) {
        for (const delItem of parsed.delete) {
          if (typeof delItem === 'string' && delItem.trim()) {
            memoryUpdate.delete.push(delItem.trim());
          }
        }
      }
    } catch {
      // ignore malformed JSON
    }
  }

  const actionMatch = cleanAnswer.match(/<ultron_action>([\s\S]*?)<\/ultron_action>/i);
  if (actionMatch) {
    cleanAnswer = cleanAnswer.replace(/<ultron_action>[\s\S]*?<\/ultron_action>/gi, '').trim();
    const actionJson = actionMatch[1]
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    try {
      ultronAction = sanitizeUltronAction(JSON.parse(actionJson));
    } catch {
      // ignore malformed JSON
    }
  }

  cleanAnswer = cleanAnswer
    .replace(/<memory_update>[\s\S]*$/i, '')
    .replace(/<ultron_action>[\s\S]*$/i, '')
    .trim();

  return {
    cleanAnswer: cleanAnswer || 'Directive acknowledged, Rukshan.',
    memoryUpdate,
    ultronAction,
  };
}
