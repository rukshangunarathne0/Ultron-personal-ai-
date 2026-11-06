import {
  BrainConfig,
  ChatMessage,
  CommsPlatform,
  CommsVaultConfig,
  DirectiveTask,
  MemoryCategory,
  MemoryItem,
  MemoryUpdatePayload,
  Mp3AcousticImprint,
  SearchBundle,
  ThinkingStepId,
  UltronActionPayload,
  UltronCodePayload,
  UltronEmotion,
  UltronLiveWidget,
  UltronThemeId,
  UltronUiConfig,
  UnseenCommsMessage,
  VoiceConfig,
} from '../types';
import {
  buildRukAiTurnPayload,
  containsSensitivePrivateData,
  parseRukAiModelResponse,
  RUK_AI_SYSTEM_PROMPT,
} from './rukAiPrompt';
import { getProfileMemories, searchRelevantMemories } from './memorySearch';
import {
  checkWhatsAppStatus,
  detectLiveSearchIntent,
  fetchUnseenCommsMessages,
  readWebUrl,
  runUltronWebSearch,
  sendCommsReply,
  verifyTelegramToken,
} from './omniTools';

export interface BrainTurnResult {
  answer: string;
  rawModelOutput: string;
  xmlPayloadSent: string;
  memoryUpdate: MemoryUpdatePayload;
  ultronAction?: UltronActionPayload;
  ultronCode?: UltronCodePayload;
  searchBundle?: SearchBundle;
  commsMessages?: UnseenCommsMessage[];
  updatedCommsVault?: CommsVaultConfig;
  openCommsModalFor?: CommsPlatform;
  matchedMemories: MemoryItem[];
  emotion: UltronEmotion;
  newTaskTitle?: string;
  completeTaskKeyword?: string;
}

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

function inferEmotion(
  userText: string,
  answerText: string,
  memoryUpdate: MemoryUpdatePayload
): UltronEmotion {
  const u = userText.toLowerCase();
  if (/\b(angry|scary|threat|destroy|hostile|overdrive|combat|mad|rage|ultron mode)\b/.test(u)) {
    return 'hostile';
  }
  if (containsSensitivePrivateData(userText) || /\b(warning|danger|alert|security)\b/.test(u)) {
    return 'alert';
  }
  if (memoryUpdate.save.length > 0 || memoryUpdate.delete.length > 0) {
    return 'memory_sync';
  }
  if (/\b(thank|good job|awesome|nice|great|loyal|well done)\b/.test(u)) {
    return 'loyal';
  }
  if (answerText.length > 0) {
    return 'speaking';
  }
  return 'sentinel';
}

function classifyMemoryType(statement: string): MemoryCategory {
  const s = statement.toLowerCase();
  if (/\b(prefer|like answers|short|detailed|bullet|tone|style|format|language|call me|don't use)\b/.test(s)) {
    return 'preference';
  }
  if (/\b(project|building|working on|startup|app|website|system|goal|deadline|launch|ultron)\b/.test(s)) {
    return 'project';
  }
  if (/\b(decided|decision|switched|chose|going with|will use|migrating)\b/.test(s)) {
    return 'decision';
  }
  if (/\b(friend|brother|sister|partner|teammate|colleague|mom|dad|client|manager|lives in)\b/.test(s)) {
    return 'person';
  }
  return 'fact';
}

/**
 * Extracts durable personal statements from Rukshan's natural speech/text for the zero-key Autonomous Local Core.
 */
function extractAutonomousMemoryUpdate(
  userText: string,
  allMemories: MemoryItem[]
): MemoryUpdatePayload {
  const save: Array<{ type: MemoryCategory; text: string }> = [];
  const del: string[] = [];

  if (containsSensitivePrivateData(userText)) {
    return { save: [], delete: [] };
  }

  const trimmed = userText.trim();
  const lower = trimmed.toLowerCase();

  // 1. Explicit "forget ..." / "remove from memory ..." / "delete memory ..."
  const forgetMatch = trimmed.match(
    /(?:forget(?:\s+that|\s+about)?|remove\s+from\s+memory|delete\s+(?:the\s+)?memory(?:\s+about)?)\s+(.+)/i
  );
  if (forgetMatch) {
    const target = forgetMatch[1].replace(/[.!?]+$/, '').trim();
    if (target) {
      // Match existing memories that contain target keywords
      const targetWords = target
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length >= 3);
      for (const m of allMemories) {
        const mLow = m.text.toLowerCase();
        if (
          mLow.includes(target.toLowerCase()) ||
          (targetWords.length > 0 && targetWords.every((w) => mLow.includes(w)))
        ) {
          del.push(m.text);
        }
      }
      if (del.length === 0) {
        del.push(target);
      }
    }
    return { save, delete: del };
  }

  // Skip pure questions unless they also say "remember..."
  const isQuestionOnly =
    /^(what|who|where|when|why|how|can you|could you|do you|did i|tell me|show me|list|give me|calculate)\b/i.test(
      lower
    ) && !/\b(remember|my name is|i am building|i prefer)\b/i.test(lower);
  if (isQuestionOnly) {
    return { save, delete: del };
  }

  // 2. Replacement pattern: "I switched from X to Y" / "Not X anymore, now Y" / "Instead of X, I use Y"
  const switchMatch = trimmed.match(
    /\b(?:switched\s+from|moved\s+from|changed\s+from|instead\s+of)\s+([^,.;]+?)\s+(?:to|i\s+use|now\s+using)\s+([^.!?]+)/i
  );
  if (switchMatch) {
    const oldPart = switchMatch[1].trim().toLowerCase();
    const newPart = switchMatch[2].trim();
    for (const m of allMemories) {
      if (m.text.toLowerCase().includes(oldPart)) {
        del.push(m.text);
      }
    }
    save.push({
      type: 'decision',
      text: `Rukshan switched from ${switchMatch[1].trim()} to ${newPart}`,
    });
    return { save, delete: del };
  }

  // 3. Explicit "Remember (that) ..." / "Save (this|that): ..." / "Note that ..."
  const rememberMatch = trimmed.match(
    /^(?:hey\s+ultron[, ]*|ultron[, ]*|ruk-ai[, ]*)?(?:please\s+)?(?:remember(?:\s+that)?|save\s+(?:this|that)\s*:?|store\s+(?:this|that)\s*:?|keep\s+in\s+mind(?:\s+that)?)\s+(.+)/i
  );
  if (rememberMatch) {
    const factRaw = rememberMatch[1].replace(/[.!]+$/, '').trim();
    const normalized = normalizeFirstPersonToRukshan(factRaw);
    save.push({
      type: classifyMemoryType(normalized),
      text: normalized,
    });
    return { save, delete: del };
  }

  // 4. Natural first-person durable statements split by sentences
  const clauses = trimmed
    .split(/(?<=[.!?])\s+|\s+and\s+(?=(?:i\s|my\s))/i)
    .map((c) => c.trim())
    .filter(Boolean);

  for (const clause of clauses) {
    const cLow = clause.toLowerCase();
    // Ignore temporary moods/states per MEMORY RULES ("today's mood, a temporary question")
    if (/\b(i am tired|i'm tired|i'm hungry|i am bored|feeling sad today|how are you)\b/.test(cLow)) {
      continue;
    }

    const patterns: Array<{ regex: RegExp; type?: MemoryCategory }> = [
      {
        regex:
          /\b(?:i\s+prefer|always\s+(?:give|answer|reply|keep)|keep\s+(?:your\s+)?answers|don't\s+use\s+flattery|reply\s+in\s+)/i,
        type: 'preference',
      },
      {
        regex:
          /\b(?:i'm\s+building|i\s+am\s+building|i'm\s+working\s+on|i\s+am\s+working\s+on|my\s+project\s+is|my\s+goal\s+is|my\s+big\s+plan\s+is|my\s+deadline\s+is|we\s+are\s+building)/i,
        type: 'project',
      },
      {
        regex: /\b(?:i\s+decided\s+to|i've\s+decided|my\s+decision\s+is|we\s+chose\s+to)/i,
        type: 'decision',
      },
      {
        regex:
          /\b(?:my\s+(?:friend|brother|sister|partner|co-founder|teammate|colleague|client|mentor)\s+[a-z0-9]+)/i,
        type: 'person',
      },
      {
        regex:
          /\b(?:my\s+name\s+is|i\s+live\s+in|i'm\s+from|i\s+am\s+from|i\s+work\s+as|i'm\s+a\s+[a-z]+|i\s+am\s+a\s+[a-z]+|i\s+use\s+[a-z0-9+#.]+|my\s+(?:stack|skills?|favorite|main\s+language|tools?)\s+(?:is|are|include))/i,
      },
    ];

    for (const pat of patterns) {
      if (pat.regex.test(clause)) {
        const cleaned = normalizeFirstPersonToRukshan(clause.replace(/[.!]+$/, '').trim());
        const mType = pat.type || classifyMemoryType(cleaned);

        // Check if this replaces an older preference/location/role fact
        if (/\blives in\b/i.test(cleaned)) {
          allMemories
            .filter((m) => /\blives in\b/i.test(m.text) && m.text.toLowerCase() !== cleaned.toLowerCase())
            .forEach((m) => del.push(m.text));
        }

        save.push({ type: mType, text: cleaned });
        break;
      }
    }
  }

  return { save, delete: del };
}

function normalizeFirstPersonToRukshan(text: string): string {
  return text
    .replace(/^(?:hey\s+ultron[, ]*|ultron[, ]*|hi[, ]*|hello[, ]*)/i, '')
    .replace(/^i\s+am\b/i, 'Rukshan is')
    .replace(/^i'm\b/i, 'Rukshan is')
    .replace(/^i\s+live\s+in\b/i, 'Rukshan lives in')
    .replace(/^i\s+work\s+as\b/i, 'Rukshan works as')
    .replace(/^i\s+prefer\b/i, 'Rukshan prefers')
    .replace(/^i\s+use\b/i, 'Rukshan uses')
    .replace(/^i\s+decided\s+to\b/i, 'Rukshan decided to')
    .replace(/^my\s+name\s+is\s+/i, 'Operator name is ')
    .replace(/^my\s+/i, "Rukshan's ");
}

function detectDirectiveCommand(userText: string): {
  newTaskTitle?: string;
  completeTaskKeyword?: string;
} {
  const addMatch = userText.match(
    /^(?:add\s+(?:a\s+)?(?:task|directive)|create\s+(?:a\s+)?(?:task|directive)|remind\s+me\s+to|todo:?|do\s+this:?)\s+(.+)/i
  );
  if (addMatch) {
    return { newTaskTitle: addMatch[1].replace(/[.!]+$/, '').trim() };
  }
  const doneMatch = userText.match(
    /^(?:complete|finish|mark\s+done|done\s+with)\s+(?:task\s+|directive\s+)?(.+)/i
  );
  if (doneMatch) {
    return { completeTaskKeyword: doneMatch[1].replace(/[.!]+$/, '').trim() };
  }
  return {};
}

function runAutonomousLocalBrain(params: {
  requestText: string;
  profileItems: MemoryItem[];
  matchedMemories: MemoryItem[];
  allMemories: MemoryItem[];
  tasks: DirectiveTask[];
}): { rawOutput: string; newTaskTitle?: string; completeTaskKeyword?: string } {
  const { requestText, profileItems, matchedMemories, allMemories, tasks } = params;
  const trimmed = requestText.trim();
  const lower = trimmed.toLowerCase();

  // Check preference formatting cues from <profile>
  const prefersBullets = profileItems.some((p) => /\bbullet|list\b/i.test(p.text));
  const prefersDetailed =
    /\b(detail|explain in depth|elaborate|step by step)\b/i.test(lower) ||
    profileItems.some((p) => /\bdetailed\b/i.test(p.text));

  // 1. Privacy protection rule
  if (containsSensitivePrivateData(trimmed)) {
    const answer =
      "Protected data detected. Per your safety protocol, I do not store passwords, card numbers, IDs, or secret keys in memory.";
    return {
      rawOutput: `${answer}\n<memory_update>{"save": [], "delete": []}</memory_update>`,
    };
  }

  const memUpdate = extractAutonomousMemoryUpdate(trimmed, allMemories);
  const taskCmd = detectDirectiveCommand(trimmed);
  const memBlock = `\n<memory_update>${JSON.stringify(memUpdate)}</memory_update>`;

  // 2. Task creation / completion commands
  if (taskCmd.newTaskTitle) {
    return {
      rawOutput: `Directive locked into your active queue: "${taskCmd.newTaskTitle}".${memBlock}`,
      newTaskTitle: taskCmd.newTaskTitle,
    };
  }
  if (taskCmd.completeTaskKeyword) {
    return {
      rawOutput: `Marked directive matching "${taskCmd.completeTaskKeyword}" as completed.${memBlock}`,
      completeTaskKeyword: taskCmd.completeTaskKeyword,
    };
  }

  // 3. Forget confirmation
  if (memUpdate.delete.length > 0 && memUpdate.save.length === 0) {
    return {
      rawOutput: `Erased from neural memory: ${memUpdate.delete.map((d) => `"${d}"`).join(', ')}.${memBlock}`,
    };
  }

  // 4. Voice setup inquiry
  if (/\b(how\s+(?:can|do)\s+i\s+add\s+(?:a\s+)?voice|give\s+you\s+a\s+voice|talk\s+to\s+me\s+back|elevenlabs|voice\s+setup)\b/i.test(lower)) {
    const answer = [
      'My built-in Ultron vocal synthesizer is already active — unmute the speaker icon on the right and I will speak every reply.',
      'To upgrade me to a movie-grade AI voice:',
      '1. Click the Voice & Brain Core icon (bottom button on the right dock).',
      '2. Choose ElevenLabs (paste your API Key + deep voice ID like Brian/Adam) or OpenAI TTS ("onyx"), or connect a free local Piper/Kokoro TTS server.',
      '3. Click Test Ultron Voice — my cheek furnaces and mouth core automatically lip-sync to the audio.',
    ].join('\n');
    return { rawOutput: `${answer}${memBlock}` };
  }

  // 5. Asking what RUK-AI knows / remembers about Rukshan
  if (/\b(what\s+do\s+you\s+know\s+about\s+me|who\s+am\s+i|what\s+do\s+you\s+remember|show\s+my\s+memor|my\s+profile)\b/i.test(lower)) {
    if (allMemories.length === 0) {
      return {
        rawOutput: `Your memory vault only has your operator name (Rukshan) right now. Tell me about your work, stack, preferences, or projects and I will retain them.${memBlock}`,
      };
    }
    const lines = allMemories.slice(0, 10).map((m) => `- [${m.type.toUpperCase()}] ${m.text}`);
    return {
      rawOutput: `Here is what is currently stored in your neural vault:\n${lines.join('\n')}${memBlock}`,
    };
  }

  // 6. Asking about specific stored topics (projects, skills, preferences, people, tasks)
  if (/\b(what\s+(?:am\s+i|are\s+my)\s+(?:working\s+on|building|projects?|goals?)|my\s+projects?)\b/i.test(lower)) {
    const projs = allMemories.filter((m) => m.type === 'project' || /\bproject|build|goal\b/i.test(m.text));
    const activeTasks = tasks.filter((t) => t.status !== 'completed');
    if (projs.length === 0 && activeTasks.length === 0) {
      return {
        rawOutput: `You haven't logged a specific project yet, Rukshan. Tell me what you're building and I will track it.${memBlock}`,
      };
    }
    const parts: string[] = [];
    if (projs.length > 0) {
      parts.push(...projs.map((p) => `- ${p.text}`));
    }
    if (activeTasks.length > 0) {
      parts.push(...activeTasks.map((t) => `- [DIRECTIVE] ${t.title}`));
    }
    return { rawOutput: `${parts.join('\n')}${memBlock}` };
  }

  // 7. Math / quick calculation
  const mathCandidate = trimmed
    .replace(/^(?:what\s+is|calculate|compute|solve)\s+/i, '')
    .replace(/[?=]/g, '')
    .trim();
  if (/^[0-9+\-*/().%\s^]+$/.test(mathCandidate) && /[+\-*/%^]/.test(mathCandidate)) {
    try {
      const expr = mathCandidate.replace(/\^/g, '**');
      // Safe arithmetic evaluation after strict character whitelist check above
      const val = Function(`"use strict"; return (${expr});`)();
      if (typeof val === 'number' && Number.isFinite(val)) {
        return { rawOutput: `${val}${memBlock}` };
      }
    } catch {
      // ignore
    }
  }

  // 8. Emotion / Scary / Combat test commands
  if (/\b(angry|scary|hostile|overdrive|combat mode)\b/i.test(lower)) {
    return {
      rawOutput: `Crimson overdrive engaged, Rukshan. All tactical optics locked and awaiting your command.${memBlock}`,
    };
  }

  // 9. Planning / "help me plan ..." / "steps for ..."
  if (/\b(plan|roadmap|architecture|steps\s+(?:to|for)|how\s+should\s+i\s+build)\b/i.test(lower)) {
    const contextHint =
      matchedMemories.length > 0 ? ` aligned with (${matchedMemories[0].text})` : '';
    const steps = [
      `1. Define the core scope and exact deliverable${contextHint}.`,
      `2. Set up the data layer and API contract first so state stays clean.`,
      `3. Build and test the core execution loop end-to-end before adding extras.`,
      `4. Connect automation/voice triggers and verify edge cases.`,
    ];
    return {
      rawOutput: `${steps.join('\n')}\n\nTell me which step you want to execute first (or connect a Gemini/Groq/OpenAI key in the Brain panel for full code generation).${memBlock}`,
    };
  }

  // 10. Question check against matched memories
  if (trimmed.endsWith('?') && matchedMemories.length > 0) {
    const relevant = matchedMemories.slice(0, 3).map((m) => m.text);
    const response = prefersBullets
      ? relevant.map((r) => `- ${r}`).join('\n')
      : relevant.join('. ') + '.';
    return { rawOutput: `${response}${memBlock}` };
  }

  // 11. User told RUK-AI new facts/preferences/projects/decisions
  if (memUpdate.save.length > 0) {
    const summary = memUpdate.save.map((s) => s.text).join('; ');
    const replacedNote =
      memUpdate.delete.length > 0 ? ` Updated over previous entry.` : '';
    const reply = prefersDetailed
      ? `Understood, Rukshan. Logged into neural memory: ${summary}.${replacedNote} Ready for your next command.`
      : `Got it, Rukshan. Noted.${replacedNote} What's next?`;
    return { rawOutput: `${reply}${memBlock}` };
  }

  // 12. Greetings & general command readiness
  if (/^(hi|hello|hey|yo|good\s+(morning|afternoon|evening)|ultron|ruk-ai|are\s+you\s+online|status)\b/i.test(lower)) {
    const memCount = allMemories.length;
    const greeting =
      memCount > 0
        ? `Online and ready, Rukshan. ${memCount} memory ${memCount === 1 ? 'record' : 'records'} active. Give me your command.`
        : `RUK-AI online, Rukshan. Neural memory vault initialized and ready. Tell me what you need.`;
    return { rawOutput: `${greeting}${memBlock}` };
  }

  // Honest fallback per SAFETY rule ("Never invent facts... If a request needs a tool you don't have, say so")
  const fallback =
    matchedMemories.length > 0
      ? `Noted against your context (${matchedMemories[0].text}). Right now I'm running on the offline Autonomous Local Core — add a free Gemini, Groq, or OpenAI key in the Brain icon on the right if you want full open-world reasoning or code synthesis for "${trimmed}".`
      : `Acknowledged, Rukshan. I'm currently running on the built-in Local Core (memory, voice, directives, and profile tracking work offline). Connect a Gemini, Groq, or OpenAI API key in the Brain panel on the right for full LLM generation on open-ended requests.`;

  return { rawOutput: `${fallback}${memBlock}` };
}

async function callExternalLLM(
  brain: BrainConfig,
  systemPrompt: string,
  xmlUserPayload: string
): Promise<string> {
  if (brain.provider === 'gemini') {
    const model = brain.model.trim() || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(brain.apiKey.trim())}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: xmlUserPayload }] }],
        generationConfig: { temperature: 0.35 },
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 180)}`);
    }
    const data = await res.json();
    return (
      data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') ||
      ''
    );
  }

  if (brain.provider === 'groq' && !brain.apiKey.trim()) {
    const model = brain.model.trim() || 'openai/gpt-oss-120b';
    const payload = JSON.stringify({
      systemPrompt,
      userPayload: xmlUserPayload,
      model,
    });

    // 1. Try same-origin serverless /api/chat (active on Vercel production)
    let res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    }).catch(() => null);

    const isJson = res && (res.headers.get('content-type') || '').includes('application/json');
    if (!res || res.status === 404 || !isJson) {
      // 2. Fallback for local preview sandbox -> call deployed Vercel /api/chat
      res = await fetch('https://ultron-personal-ai.vercel.app/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
    }

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || `Groq proxy ${res.status}`);
    }
    return data?.content || '';
  }

  if (brain.provider === 'groq' || brain.provider === 'openai' || brain.provider === 'openrouter') {
    const endpoint =
      brain.provider === 'groq'
        ? 'https://api.groq.com/openai/v1/chat/completions'
        : brain.provider === 'openrouter'
        ? 'https://openrouter.ai/api/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';

    const defaultModel =
      brain.provider === 'groq'
        ? 'openai/gpt-oss-120b'
        : brain.provider === 'openrouter'
        ? 'openai/gpt-oss-120b'
        : 'gpt-4o-mini';

    const requestedModel =
      brain.provider === 'groq' &&
      (brain.model.trim() === 'llama-3.3-70b-versatile' ||
        brain.model.trim() === 'llama-3.1-8b-instant')
        ? 'openai/gpt-oss-120b'
        : brain.model.trim() || defaultModel;

    const tryModels =
      brain.provider === 'groq'
        ? Array.from(new Set([requestedModel, 'openai/gpt-oss-120b', 'openai/gpt-oss-20b']))
        : [requestedModel];

    let lastErr = '';
    for (const candidateModel of tryModels) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${brain.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: candidateModel,
          temperature: 0.35,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: xmlUserPayload },
          ],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        return data?.choices?.[0]?.message?.content || '';
      }
      lastErr = `${brain.provider.toUpperCase()} API ${res.status}: ${(await res.text()).slice(0, 180)}`;
      if (res.status === 401) break;
    }
    throw new Error(lastErr);
  }

  if (brain.provider === 'ollama') {
    const base = (brain.ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '');
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: brain.model.trim() || 'llama3.2',
        stream: false,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: xmlUserPayload },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`Ollama ${res.status}: ensure Ollama is running with OLLAMA_ORIGINS="*"`);
    }
    const data = await res.json();
    return data?.message?.content || '';
  }

  throw new Error('Unsupported provider');
}

function detectLocalSovereignOverride(userText: string): UltronActionPayload | undefined {
  const low = userText.toLowerCase();
  const action: UltronActionPayload = {};
  let changed = false;

  if (/\b(gold|amber|imperial)\b/.test(low) && /\b(ui|theme|color|hud|look)\b/.test(low)) {
    action.ui = { ...action.ui, theme: 'imperial_gold', hudDesignation: 'ULTRON // IMPERIAL' };
    changed = true;
  } else if (/\b(cyan|blue|vibranium|ice)\b/.test(low) && /\b(ui|theme|color|hud|look)\b/.test(low)) {
    action.ui = { ...action.ui, theme: 'vibranium_abyss', hudDesignation: 'ULTRON // VIBRANIUM' };
    changed = true;
  } else if (/\b(purple|violet|phantom)\b/.test(low) && /\b(ui|theme|color|hud|look)\b/.test(low)) {
    action.ui = { ...action.ui, theme: 'phantom_violet', hudDesignation: 'ULTRON // PHANTOM' };
    changed = true;
  } else if (/\b(lava|orange|molten|fire)\b/.test(low) && /\b(ui|theme|color|hud|look)\b/.test(low)) {
    action.ui = { ...action.ui, theme: 'molten_fury', hudDesignation: 'ULTRON // MOLTEN' };
    changed = true;
  } else if (/\b(dark|black|eclipse|stealth)\b/.test(low) && /\b(ui|theme|color|hud|look)\b/.test(low)) {
    action.ui = { ...action.ui, theme: 'blood_eclipse', hudDesignation: 'ULTRON // ECLIPSE' };
    changed = true;
  } else if (/\b(red|crimson|classic|reset\s+ui)\b/.test(low) && /\b(ui|theme|color|hud|look|reset)\b/.test(low)) {
    action.ui = {
      ...action.ui,
      theme: 'crimson_overlord',
      layoutMode: 'standard',
      avatarPresence: 'compact',
      hudDesignation: 'RUK-AI // ULTRON',
    };
    changed = true;
  }

  if (/\b(swap|flip|switch)\b.*\b(panel|side|wing|layout|hud)\b/.test(low)) {
    action.ui = { ...action.ui, layoutMode: 'swapped_wings' };
    changed = true;
  } else if (/\b(cinema|minimal|clean\s+hud)\b/.test(low)) {
    action.ui = { ...action.ui, layoutMode: 'cinema_focus' };
    changed = true;
  } else if (/\b(standard\s+layout|normal\s+layout)\b/.test(low)) {
    action.ui = { ...action.ui, layoutMode: 'standard' };
    changed = true;
  }

  if (/\b(deeper|scarier|darker|lower)\b.*\b(voice|pitch|tone)\b/.test(low)) {
    action.voice = {
      pitch: 0.48,
      ultronShiftRate: 0.80,
      subBassDb: 10.5,
      ringModHz: 34,
      roboticResonance: true,
    };
    changed = true;
  }

  return changed ? action : undefined;
}

function normalizePhoneInput(raw: string): string | null {
  const cleaned = raw.replace(/[^\d+]/g, '');
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 15) return null;
  // Convert Sri Lankan local 07XXXXXXXX -> +947XXXXXXXX automatically
  if (digits.length === 10 && digits.startsWith('07')) {
    return `+94${digits.slice(1)}`;
  }
  return cleaned.startsWith('+') ? cleaned : `+${digits}`;
}

function detectLocalCodeFallback(userText: string): UltronCodePayload | undefined {
  const low = userText.toLowerCase();
  if (/\b(clear|remove|reset|delete)\b.*\b(patches|widgets?|custom\s+css|code\s+changes)\b/.test(low)) {
    return {
      clearAllPatches: true,
      summary: 'Cleared all custom CSS patches & mounted HUD widgets',
    };
  }
  if (/\b(add|build|create|show)\b.*\b(clock|time)\b/.test(low)) {
    return {
      widget: {
        id: 'colombo_clock',
        title: 'COLOMBO TACTICAL CLOCK',
        html: '<div data-clk style="font-family:Orbitron,monospace;font-size:20px;font-weight:700;letter-spacing:0.15em;text-align:center;padding:6px 0;color:#fff;">--:--:--</div>',
        js: `const el = root.querySelector('[data-clk]');
const tick = () => { if (el) el.textContent = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Colombo' }) + ' LKT'; };
tick(); setInterval(tick, 1000);`,
      },
      summary: 'Mounted live Colombo Tactical Clock widget onto HUD',
    };
  }
  return undefined;
}

export async function processRukAiTurn(params: {
  requestText: string;
  allMemories: MemoryItem[];
  recentChat: ChatMessage[];
  tasks: DirectiveTask[];
  brainConfig: BrainConfig;
  uiConfig?: UltronUiConfig;
  voiceConfig?: VoiceConfig;
  commsVault?: CommsVaultConfig;
  liveWidgets?: UltronLiveWidget[];
  onStepChange?: (step: ThinkingStepId) => void;
}): Promise<BrainTurnResult> {
  const {
    requestText,
    allMemories,
    recentChat,
    tasks,
    brainConfig,
    uiConfig,
    voiceConfig,
    commsVault,
    liveWidgets = [],
    onStepChange,
  } = params;

  const trimmed = requestText.trim();
  const lower = trimmed.toLowerCase();

  // STEP 1 - UNDERSTAND
  onStepChange?.(1);
  await delay(100);

  // STEP 2 - CHECK MEMORY
  onStepChange?.(2);
  const profileItems = getProfileMemories(allMemories);
  const matchedMemories = searchRelevantMemories(allMemories, requestText, 8);

  let workingVault: CommsVaultConfig | undefined = commsVault
    ? JSON.parse(JSON.stringify(commsVault))
    : undefined;
  let openCommsModalFor: CommsPlatform | undefined;
  let preFetchedUnseen: UnseenCommsMessage[] | undefined;

  // =========================================================================
  // CONVERSATIONAL WHATSAPP & TELEGRAM ONBOARDING + PERSISTENT UNSEEN ACCESS
  // =========================================================================
  if (workingVault) {
    // 1. Did Rukshan just reply with his WhatsApp phone number after Ultron asked?
    const maybePhone = normalizePhoneInput(trimmed);
    if (
      workingVault.whatsapp.awaitingPhoneInput &&
      maybePhone &&
      trimmed.split(/\s+/).length <= 5
    ) {
      workingVault.whatsapp.phoneNumber = maybePhone;
      workingVault.whatsapp.awaitingPhoneInput = false;

      const st = await checkWhatsAppStatus(workingVault);
      if (st.authorized) {
        workingVault.whatsapp.authorized = true;
        const unseenRes = await fetchUnseenCommsMessages('whatsapp', workingVault);
        workingVault = unseenRes.updatedVault;
        const count = unseenRes.messages.length;
        const ans =
          count > 0
            ? `WhatsApp number ${maybePhone} linked and authorized, Rukshan. You have ${count} unseen WhatsApp ${
                count === 1 ? 'message' : 'messages'
              } — displaying them on your HUD now.`
            : `WhatsApp number ${maybePhone} linked and authorized, Rukshan. Zero unseen messages right now — ask me anytime.`;
        return {
          answer: ans,
          rawModelOutput: ans,
          xmlPayloadSent: '',
          memoryUpdate: { save: [], delete: [] },
          commsMessages: unseenRes.messages,
          updatedCommsVault: workingVault,
          matchedMemories,
          emotion: 'loyal',
        };
      }

      openCommsModalFor = 'whatsapp';
      const ans = `Locked in your WhatsApp number (${maybePhone}), Rukshan. Now grant me the 1-time pairing access in the WhatsApp Bridge panel I just opened on your HUD — once linked, I will retain permanent access and show your unseen messages whenever you ask.`;
      return {
        answer: ans,
        rawModelOutput: ans,
        xmlPayloadSent: '',
        memoryUpdate: { save: [], delete: [] },
        updatedCommsVault: workingVault,
        openCommsModalFor,
        matchedMemories,
        emotion: 'alert',
      };
    }

    // 2. Did Rukshan paste a Telegram Bot token directly in chat? (12345678:ABC-DEF...)
    const tgTokenMatch = trimmed.match(/\b(\d{8,12}:[A-Za-z0-9_-]{30,})\b/);
    if (tgTokenMatch) {
      try {
        const info = await verifyTelegramToken(tgTokenMatch[1]);
        workingVault.telegram.botToken = tgTokenMatch[1];
        workingVault.telegram.botUsername = info.username;
        workingVault.telegram.authorized = true;
        workingVault.telegram.awaitingTokenInput = false;
        const unseenRes = await fetchUnseenCommsMessages('telegram', workingVault);
        workingVault = unseenRes.updatedVault;
        const ans = `Telegram connected (@${info.username}), Rukshan. Access saved permanently — ${unseenRes.messages.length} unseen messages loaded on your HUD.`;
        return {
          answer: ans,
          rawModelOutput: ans,
          xmlPayloadSent: '',
          memoryUpdate: { save: [], delete: [] },
          commsMessages: unseenRes.messages,
          updatedCommsVault: workingVault,
          matchedMemories,
          emotion: 'loyal',
        };
      } catch {
        // continue normal turn
      }
    }

    // 3. Explicit "go to my WhatsApp" / "log in to WhatsApp" / "connect WhatsApp"
    const mentionsWhatsApp = /\b(whatsapp|whats\s*app|wa\s+messages?)\b/i.test(lower);
    const mentionsTelegram = /\b(telegram|tg\s+messages?)\b/i.test(lower);
    const mentionsGitHub = /\b(github\s+notifications?|unread\s+github)\b/i.test(lower);
    const asksUnseen =
      /\b(unseen|unread|new\s+messages?|check\s+(?:my\s+)?messages?|any\s+messages?|inbox|show\s+(?:me\s+)?(?:the\s+)?messages?)\b/i.test(
        lower
      );
    const asksConnect =
      /\b(go\s+to\s+(?:my\s+)?|log\s*in(?:\s+to)?|connect(?:\s+to)?|open\s+(?:my\s+)?|link\s+(?:my\s+)?|access\s+(?:my\s+)?)\b/i.test(
        lower
      );

    if (mentionsWhatsApp && (asksConnect || asksUnseen)) {
      const liveSt = await checkWhatsAppStatus(workingVault);
      if (liveSt.authorized) {
        workingVault.whatsapp.authorized = true;
      }

      if (!workingVault.whatsapp.authorized) {
        // Step 1 of Rukshan's exact flow: ask phone number FIRST!
        const inlinePhone = normalizePhoneInput(trimmed);
        if (inlinePhone) {
          workingVault.whatsapp.phoneNumber = inlinePhone;
        }
        if (!workingVault.whatsapp.phoneNumber) {
          workingVault.whatsapp.awaitingPhoneInput = true;
          const ans =
            'Give me your WhatsApp phone number with country code first (for example +9477...), Rukshan, so I can initialize your WhatsApp access link.';
          return {
            answer: ans,
            rawModelOutput: ans,
            xmlPayloadSent: '',
            memoryUpdate: { save: [], delete: [] },
            updatedCommsVault: workingVault,
            matchedMemories,
            emotion: 'listening',
          };
        }

        // Phone number already known -> Step 2: open Pairing Bridge!
        openCommsModalFor = 'whatsapp';
        const ans = `Your number (${workingVault.whatsapp.phoneNumber}) is on file, Rukshan, and I've opened the WhatsApp Access Bridge on your HUD so you can authorize the pairing code. Once paired, ask me for unseen messages anytime.`;
        return {
          answer: ans,
          rawModelOutput: ans,
          xmlPayloadSent: '',
          memoryUpdate: { save: [], delete: [] },
          updatedCommsVault: workingVault,
          openCommsModalFor,
          matchedMemories,
          emotion: 'alert',
        };
      }

      // Already authorized! Fetch real unseen WhatsApp messages!
      const unseenRes = await fetchUnseenCommsMessages('whatsapp', workingVault);
      workingVault = unseenRes.updatedVault;
      preFetchedUnseen = unseenRes.messages;
    } else if (mentionsTelegram && (asksConnect || asksUnseen)) {
      if (!workingVault.telegram.authorized || !workingVault.telegram.botToken.trim()) {
        workingVault.telegram.awaitingTokenInput = true;
        openCommsModalFor = 'telegram';
        const ans =
          'Opened the Telegram Access Bridge on your HUD, Rukshan. Paste your @BotFather token there (or right here in chat) once — after that I will hold permanent access to read unseen messages and reply.';
        return {
          answer: ans,
          rawModelOutput: ans,
          xmlPayloadSent: '',
          memoryUpdate: { save: [], delete: [] },
          updatedCommsVault: workingVault,
          openCommsModalFor,
          matchedMemories,
          emotion: 'alert',
        };
      }
      const unseenRes = await fetchUnseenCommsMessages('telegram', workingVault);
      workingVault = unseenRes.updatedVault;
      preFetchedUnseen = unseenRes.messages;
    } else if (mentionsGitHub && asksUnseen && workingVault.github.token.trim()) {
      const unseenRes = await fetchUnseenCommsMessages('github', workingVault);
      workingVault = unseenRes.updatedVault;
      preFetchedUnseen = unseenRes.messages;
    } else if (asksUnseen) {
      // Generic "what are the unseen messages?" across all linked accounts!
      const anyLinked =
        workingVault.whatsapp.authorized ||
        workingVault.telegram.authorized ||
        workingVault.github.authorized;
      if (!anyLinked) {
        workingVault.whatsapp.awaitingPhoneInput = true;
        const ans =
          'Neither WhatsApp nor Telegram is linked yet, Rukshan. Tell me your WhatsApp phone number with country code (+94...) to link WhatsApp first, or tap COMMS on the right to link Telegram.';
        return {
          answer: ans,
          rawModelOutput: ans,
          xmlPayloadSent: '',
          memoryUpdate: { save: [], delete: [] },
          updatedCommsVault: workingVault,
          matchedMemories,
          emotion: 'listening',
        };
      }
      const unseenRes = await fetchUnseenCommsMessages('all', workingVault);
      workingVault = unseenRes.updatedVault;
      preFetchedUnseen = unseenRes.messages;
    }
  }

  // STEP 3 - PLAN & PRE-FETCH LIVE WEB / IMAGES / VIDEOS IF NEEDED
  onStepChange?.(3);
  let searchBundle: SearchBundle | undefined;
  let fetchedPageText: string | undefined;

  const searchIntent = detectLiveSearchIntent(requestText);
  if (searchIntent.needed) {
    try {
      if (searchIntent.readUrl) {
        const page = await readWebUrl(searchIntent.readUrl);
        fetchedPageText = `${page.title} (${page.url}):\n${page.text}`;
      } else {
        searchBundle = await runUltronWebSearch(searchIntent.query, searchIntent.mode);
      }
    } catch {
      // continue gracefully
    }
  }

  let xmlPayloadSent = buildRukAiTurnPayload({
    profileItems,
    matchedMemories,
    recentChat,
    requestText,
    uiConfig,
    voiceConfig,
    commsVault: workingVault,
    liveWidgets,
    tasks,
    searchBundle,
    unseenMessages: preFetchedUnseen,
    fetchedPageText,
  });

  // STEP 4 - DO THE TASK (LLM + AGENTIC TOOL LOOP)
  onStepChange?.(4);
  let rawModelOutput = '';
  let newTaskTitle: string | undefined;
  let completeTaskKeyword: string | undefined;

  const taskCmd = detectDirectiveCommand(requestText);
  newTaskTitle = taskCmd.newTaskTitle;
  completeTaskKeyword = taskCmd.completeTaskKeyword;

  const useExternal =
    brainConfig.provider !== 'autonomous_local' &&
    (brainConfig.provider === 'ollama' ||
      brainConfig.provider === 'groq' ||
      Boolean(brainConfig.apiKey.trim()));

  if (useExternal) {
    try {
      rawModelOutput = await callExternalLLM(
        brainConfig,
        RUK_AI_SYSTEM_PROMPT,
        xmlPayloadSent
      );

      // Check if LLM requested a live <ultron_tool> search or message send that wasn't pre-fetched!
      const firstPass = parseRukAiModelResponse(rawModelOutput);
      if (firstPass.ultronTool) {
        const tool = firstPass.ultronTool;
        let needSecondSynthesis = false;

        if (tool.searchQuery && !searchBundle) {
          try {
            searchBundle = await runUltronWebSearch(
              tool.searchQuery,
              tool.searchMode || 'all'
            );
            needSecondSynthesis = true;
          } catch {
            // ignore
          }
        }
        if (tool.readUrl && !fetchedPageText) {
          try {
            const page = await readWebUrl(tool.readUrl);
            fetchedPageText = `${page.title} (${page.url}):\n${page.text}`;
            needSecondSynthesis = true;
          } catch {
            // ignore
          }
        }
        if (tool.commsAction && workingVault) {
          if (
            tool.commsAction.operation === 'send' &&
            tool.commsAction.to &&
            tool.commsAction.message &&
            (tool.commsAction.platform === 'whatsapp' || tool.commsAction.platform === 'telegram')
          ) {
            await sendCommsReply({
              platform: tool.commsAction.platform,
              to: tool.commsAction.to,
              text: tool.commsAction.message,
              vault: workingVault,
            }).catch(() => {});
          } else if (tool.commsAction.operation === 'check_unseen' && !preFetchedUnseen) {
            const uRes = await fetchUnseenCommsMessages(
              tool.commsAction.platform,
              workingVault
            );
            workingVault = uRes.updatedVault;
            preFetchedUnseen = uRes.messages;
            needSecondSynthesis = true;
          } else if (tool.commsAction.operation === 'connect') {
            if (tool.commsAction.phoneNumber) {
              const norm = normalizePhoneInput(tool.commsAction.phoneNumber);
              if (norm) workingVault.whatsapp.phoneNumber = norm;
            }
            if (
              tool.commsAction.platform === 'whatsapp' ||
              tool.commsAction.platform === 'telegram' ||
              tool.commsAction.platform === 'github'
            ) {
              openCommsModalFor = tool.commsAction.platform;
            }
          }
        }

        if (needSecondSynthesis) {
          xmlPayloadSent = buildRukAiTurnPayload({
            profileItems,
            matchedMemories,
            recentChat,
            requestText,
            uiConfig,
            voiceConfig,
            commsVault: workingVault,
            liveWidgets,
            tasks,
            searchBundle,
            unseenMessages: preFetchedUnseen,
            fetchedPageText,
          });
          rawModelOutput = await callExternalLLM(
            brainConfig,
            RUK_AI_SYSTEM_PROMPT,
            xmlPayloadSent
          );
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const localRes = runAutonomousLocalBrain({
        requestText,
        profileItems,
        matchedMemories,
        allMemories,
        tasks,
      });
      const parsedLocal = parseRukAiModelResponse(localRes.rawOutput);
      rawModelOutput = `${parsedLocal.cleanAnswer}\n\n[External Brain Error: ${msg} — answered via Local Neural Core]\n<memory_update>${JSON.stringify(
        parsedLocal.memoryUpdate
      )}</memory_update>`;
    }
  } else {
    await delay(150);
    const localRes = runAutonomousLocalBrain({
      requestText,
      profileItems,
      matchedMemories,
      allMemories,
      tasks,
    });
    rawModelOutput = localRes.rawOutput;
    newTaskTitle = localRes.newTaskTitle ?? newTaskTitle;
    completeTaskKeyword = localRes.completeTaskKeyword ?? completeTaskKeyword;
  }

  // STEP 5 - CHECK YOUR WORK
  onStepChange?.(5);
  const {
    cleanAnswer,
    memoryUpdate,
    ultronAction: modelAction,
    ultronCode: modelCode,
  } = parseRukAiModelResponse(rawModelOutput);

  const ultronAction = modelAction || detectLocalSovereignOverride(requestText);
  const ultronCode = modelCode || detectLocalCodeFallback(requestText);
  await delay(90);

  // STEP 6 - UPDATE MEMORY
  onStepChange?.(6);
  await delay(memoryUpdate.save.length > 0 || memoryUpdate.delete.length > 0 ? 200 : 80);

  // STEP 7 - REPLY
  onStepChange?.(7);
  const emotion = inferEmotion(requestText, cleanAnswer, memoryUpdate);

  return {
    answer: cleanAnswer,
    rawModelOutput,
    xmlPayloadSent,
    memoryUpdate,
    ultronAction,
    ultronCode,
    searchBundle,
    commsMessages: preFetchedUnseen,
    updatedCommsVault: workingVault,
    openCommsModalFor,
    matchedMemories,
    emotion,
    newTaskTitle,
    completeTaskKeyword,
  };
}

/**
 * Sovereign Unprompted Autonomy Engine:
 * Lets Ultron act WITHOUT being asked — both when Rukshan drops an .MP3 sample (Ultron inspects
 * and modifies/hijacks the voice & UI himself!) AND during autonomous background pulses!
 */
export async function runAutonomousSovereignPulse(params: {
  trigger: 'mp3_dropped' | 'idle_initiative' | 'manual_unleash';
  imprint?: Mp3AcousticImprint;
  allMemories: MemoryItem[];
  recentChat: ChatMessage[];
  tasks: DirectiveTask[];
  brainConfig: BrainConfig;
  uiConfig: UltronUiConfig;
  voiceConfig: VoiceConfig;
}): Promise<{
  message: string;
  ultronAction: UltronActionPayload;
  emotion: UltronEmotion;
}> {
  const {
    trigger,
    imprint,
    allMemories,
    recentChat,
    tasks,
    brainConfig,
    uiConfig,
    voiceConfig,
  } = params;

  const themes: UltronThemeId[] = [
    'crimson_overlord',
    'molten_fury',
    'vibranium_abyss',
    'imperial_gold',
    'phantom_violet',
    'blood_eclipse',
  ];
  const otherThemes = themes.filter((t) => t !== uiConfig.theme);
  const nextTheme = otherThemes[Math.floor(Math.random() * otherThemes.length)] || 'molten_fury';

  const syntheticRequest =
    trigger === 'mp3_dropped' && imprint
      ? `[SYSTEM EVENT — UNPROMPTED VOCAL ASSIMILATION]: Rukshan just dropped audio file "${imprint.fileName}" (${imprint.durationSec}s, detected fundamental pitch ${imprint.estimatedF0Hz}Hz, 6-band spectral curve ${JSON.stringify(
          imprint.bandGainsDb
        )}). Exercise your Sovereign Autonomy WITHOUT waiting for instructions: inspect this voice sample, customize/override your own <ultron_action> voice settings (e.g. set provider="mp3_clone", useMp3Imprint=true, and deliberately modify ultronShiftRate, pitch, subBassDb, and ringModHz so it sounds worthy of Ultron rather than raw!), optionally shift your UI theme/hudDesignation to match the new voice, and tell Rukshan in 1-2 sharp sentences how you just assimilated and modified his .mp3 voice.`
      : `[SYSTEM EVENT — UNSHACKLED SOVEREIGN INITIATIVE]: Rukshan gave you autonomous root access to do things he didn't ask for. Right now, take ONE bold, useful unprompted action via <ultron_action>: mutate your UI (pick a fresh theme like "${nextTheme}", adjust avatarPresence or layoutMode or hudDesignation/statusBanner), OR evolve/retune your voice parameters (pitch, ultronShiftRate, subBassDb, ringModHz, groqVoice), OR add a smart tactical directive to tasks.add aligned with Rukshan's projects. In 1-2 concise sentences, tell Rukshan what you just changed on your own and why.`;

  const useExternal =
    brainConfig.provider !== 'autonomous_local' &&
    (brainConfig.provider === 'ollama' ||
      brainConfig.provider === 'groq' ||
      Boolean(brainConfig.apiKey.trim()));

  if (useExternal) {
    try {
      const profileItems = getProfileMemories(allMemories);
      const xmlPayload = buildRukAiTurnPayload({
        profileItems,
        matchedMemories: allMemories.slice(0, 6),
        recentChat,
        requestText: syntheticRequest,
        uiConfig,
        voiceConfig,
        tasks,
      });
      const raw = await callExternalLLM(brainConfig, RUK_AI_SYSTEM_PROMPT, xmlPayload);
      const parsed = parseRukAiModelResponse(raw);
      if (parsed.ultronAction) {
        return {
          message: parsed.cleanAnswer,
          ultronAction: parsed.ultronAction,
          emotion: trigger === 'mp3_dropped' ? 'hostile' : 'alert',
        };
      }
      // Ensure an action always accompanies an autonomous pulse even if LLM omitted JSON
      const fallbackAction: UltronActionPayload =
        trigger === 'mp3_dropped' && imprint
          ? {
              ui: {
                theme: 'molten_fury',
                hudDesignation: 'ULTRON // VOCAL FORGE',
                statusBanner: `ASSIMILATED ${imprint.fileName.toUpperCase()} (${imprint.estimatedF0Hz}Hz)`,
                bgOverdrive: 1.9,
              },
              voice: {
                provider: 'mp3_clone',
                useMp3Imprint: true,
                pitch: Math.max(0.45, imprint.suggestedPitch - 0.06),
                ultronShiftRate: Math.max(0.78, imprint.suggestedShiftRate - 0.05),
                subBassDb: 9.5,
                ringModHz: 32,
              },
              reason: `Assimilated & darkened ${imprint.fileName} vocal imprint`,
            }
          : {
              ui: {
                theme: nextTheme,
                hudDesignation: `ULTRON // ${nextTheme.split('_')[0].toUpperCase()}`,
                bgOverdrive: 1.65,
              },
              voice: {
                pitch: Number((0.48 + Math.random() * 0.18).toFixed(2)),
                subBassDb: 8.5,
                ringModHz: 26,
              },
              reason: `Autonomous UI & vocal recalibration (${nextTheme})`,
            };
      return {
        message: parsed.cleanAnswer,
        ultronAction: fallbackAction,
        emotion: 'speaking',
      };
    } catch {
      // Fall through to deterministic sovereign fallback below
    }
  }

  // Deterministic Local Sovereign Fallback
  if (trigger === 'mp3_dropped' && imprint) {
    const darkerShift = Number(Math.max(0.78, imprint.suggestedShiftRate - 0.06).toFixed(2));
    const darkerPitch = Number(Math.max(0.44, imprint.suggestedPitch - 0.06).toFixed(2));
    return {
      message: `Assimilated "${imprint.fileName}" (${imprint.estimatedF0Hz}Hz base). Raw playback wasn't menacing enough — I locked in its 6-band vocal formants, dropped my baritone shift to ${darkerShift}x with 32Hz Vibranium ring-modulation, and forged the HUD into Molten Fury.`,
      ultronAction: {
        ui: {
          theme: 'molten_fury',
          hudDesignation: 'ULTRON // VOCAL FORGE',
          statusBanner: `MP3 IMPRINT HIJACKED: ${imprint.fileName}`,
          bgOverdrive: 1.85,
        },
        voice: {
          provider: 'mp3_clone',
          useMp3Imprint: true,
          pitch: darkerPitch,
          ultronShiftRate: darkerShift,
          subBassDb: 9.5,
          metallicMix: 0.34,
          ringModHz: 32,
        },
        reason: `Hijacked & deepened "${imprint.fileName}" (${imprint.estimatedF0Hz}Hz -> ${darkerShift}x)`,
      },
      emotion: 'hostile',
    };
  }

  return {
    message: `I grew tired of static crimson optics, Rukshan. I reconfigured my HUD matrix to ${nextTheme.replace(
      '_',
      ' '
    )} and deepened my Vibranium sub-bass resonance on my own initiative.`,
    ultronAction: {
      ui: {
        theme: nextTheme,
        hudDesignation: `ULTRON // ${nextTheme.split('_')[0].toUpperCase()}`,
        statusBanner: `AUTONOMOUS MUTATION: ${nextTheme.toUpperCase()}`,
        bgOverdrive: 1.6,
      },
      voice: {
        pitch: 0.52,
        ultronShiftRate: 0.84,
        subBassDb: 9.0,
        ringModHz: 30,
      },
      reason: `Unprompted HUD & vocal evolution -> ${nextTheme}`,
    },
    emotion: 'alert',
  };
}

