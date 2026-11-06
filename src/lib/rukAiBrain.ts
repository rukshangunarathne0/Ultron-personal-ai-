import {
  BrainConfig,
  ChatMessage,
  DirectiveTask,
  MemoryCategory,
  MemoryItem,
  MemoryUpdatePayload,
  ThinkingStepId,
  UltronEmotion,
} from '../types';
import {
  buildRukAiTurnPayload,
  containsSensitivePrivateData,
  parseRukAiModelResponse,
  RUK_AI_SYSTEM_PROMPT,
} from './rukAiPrompt';
import { getProfileMemories, searchRelevantMemories } from './memorySearch';

export interface BrainTurnResult {
  answer: string;
  rawModelOutput: string;
  xmlPayloadSent: string;
  memoryUpdate: MemoryUpdatePayload;
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

  if (brain.provider === 'groq' || brain.provider === 'openai' || brain.provider === 'openrouter') {
    const endpoint =
      brain.provider === 'groq'
        ? 'https://api.groq.com/openai/v1/chat/completions'
        : brain.provider === 'openrouter'
        ? 'https://openrouter.ai/api/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';

    const defaultModel =
      brain.provider === 'groq'
        ? 'llama-3.3-70b-versatile'
        : brain.provider === 'openrouter'
        ? 'meta-llama/llama-3.3-70b-instruct'
        : 'gpt-4o-mini';

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${brain.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: brain.model.trim() || defaultModel,
        temperature: 0.35,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: xmlUserPayload },
        ],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`${brain.provider.toUpperCase()} API ${res.status}: ${errText.slice(0, 180)}`);
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || '';
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

export async function processRukAiTurn(params: {
  requestText: string;
  allMemories: MemoryItem[];
  recentChat: ChatMessage[];
  tasks: DirectiveTask[];
  brainConfig: BrainConfig;
  onStepChange?: (step: ThinkingStepId) => void;
}): Promise<BrainTurnResult> {
  const { requestText, allMemories, recentChat, tasks, brainConfig, onStepChange } = params;

  // STEP 1 - UNDERSTAND
  onStepChange?.(1);
  await delay(140);

  // STEP 2 - CHECK MEMORY
  onStepChange?.(2);
  const profileItems = getProfileMemories(allMemories);
  const matchedMemories = searchRelevantMemories(allMemories, requestText, 8);
  const xmlPayloadSent = buildRukAiTurnPayload({
    profileItems,
    matchedMemories,
    recentChat,
    requestText,
  });
  await delay(160);

  // STEP 3 - PLAN
  onStepChange?.(3);
  await delay(130);

  // STEP 4 - DO THE TASK
  onStepChange?.(4);
  let rawModelOutput = '';
  let newTaskTitle: string | undefined;
  let completeTaskKeyword: string | undefined;

  const taskCmd = detectDirectiveCommand(requestText);
  newTaskTitle = taskCmd.newTaskTitle;
  completeTaskKeyword = taskCmd.completeTaskKeyword;

  const useExternal =
    brainConfig.provider !== 'autonomous_local' &&
    (brainConfig.provider === 'ollama' || Boolean(brainConfig.apiKey.trim()));

  if (useExternal) {
    try {
      rawModelOutput = await callExternalLLM(
        brainConfig,
        RUK_AI_SYSTEM_PROMPT,
        xmlPayloadSent
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Graceful fallback to Autonomous Local Core with clear note
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
    await delay(180);
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
  const { cleanAnswer, memoryUpdate } = parseRukAiModelResponse(rawModelOutput);
  await delay(110);

  // STEP 6 - UPDATE MEMORY
  onStepChange?.(6);
  await delay(memoryUpdate.save.length > 0 || memoryUpdate.delete.length > 0 ? 240 : 100);

  // STEP 7 - REPLY
  onStepChange?.(7);
  const emotion = inferEmotion(requestText, cleanAnswer, memoryUpdate);

  return {
    answer: cleanAnswer,
    rawModelOutput,
    xmlPayloadSent,
    memoryUpdate,
    matchedMemories,
    emotion,
    newTaskTitle,
    completeTaskKeyword,
  };
}
