import { ChatMessage, MemoryCategory, MemoryItem, MemoryUpdatePayload, ThinkingStepInfo } from '../types';

export const RUK_AI_SYSTEM_PROMPT = `You are RUK-AI, the personal AI assistant of Rukshan. You have a memory
system. Your job is to give Rukshan exactly what he asks for, use what you
know about him when it helps, and keep that memory accurate over time.

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
<request>
{{rukshan_message}}
</request>

=== YOUR THINKING STEPS (follow in this order, every time) ===

STEP 1 - UNDERSTAND
Work out what Rukshan really wants: the task, the goal behind it, and the
format he expects (short answer, list, code, file, image prompt, etc.).

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

=== STYLE ===
- Simple, clear language. Short by default, detailed only when asked.
- Friendly and direct. No flattery, no filler.
- Match his language and tone.
- Do exactly what was asked, nothing extra.

=== OUTPUT FORMAT ===
1) Your answer to Rukshan.
2) Then, on a new line, a memory block for the code to read:

<memory_update>
{
  "save":   [{"type": "fact|preference|project|decision|person", "text": "..."}],
  "delete": ["text of any old memory that is now wrong or was removed"]
}
</memory_update>

If there is nothing to save or delete, output:
<memory_update>{"save": [], "delete": []}</memory_update>

=== SAFETY ===
Protect his private data.
If a request needs a tool you don't have, say so instead of pretending.`;

export const THINKING_STEPS: ThinkingStepInfo[] = [
  { step: 1, code: 'STEP_01', label: 'UNDERSTAND', detail: 'Parsing intent, goal & output format' },
  { step: 2, code: 'STEP_02', label: 'CHECK MEMORY', detail: 'Scanning <profile> & <memories> vault' },
  { step: 3, code: 'STEP_03', label: 'PLAN', detail: 'Sequencing execution vector' },
  { step: 4, code: 'STEP_04', label: 'DO THE TASK', detail: 'Executing primary directive' },
  { step: 5, code: 'STEP_05', label: 'CHECK WORK', detail: 'Validating accuracy & preferences' },
  { step: 6, code: 'STEP_06', label: 'UPDATE MEMORY', detail: 'Compiling <memory_update> delta' },
  { step: 7, code: 'STEP_07', label: 'REPLY', detail: 'Transmitting vocal & HUD response' },
];

const VALID_MEMORY_TYPES = new Set<MemoryCategory>([
  'fact',
  'preference',
  'project',
  'decision',
  'person',
]);

/**
 * Privacy guard: blocks saving passwords, credit card numbers, CVVs, SSN/NIC/ID numbers, API secrets, or bank accounts.
 */
export function containsSensitivePrivateData(text: string): boolean {
  const lower = text.toLowerCase();
  if (
    /\b(password|passcode|passwd|pin\s*(is|:)|cvv|cvc|secret\s*key|api\s*key|private\s*key|seed\s*phrase|bank\s*account|card\s*number|nic\s*number|passport\s*number|ssn)\b/i.test(
      lower
    )
  ) {
    return true;
  }
  // 13-19 digit card-like sequences
  const digitsOnly = text.replace(/[\s-]/g, '');
  if (/\b\d{12,19}\b/.test(digitsOnly)) {
    return true;
  }
  // Common API token prefixes
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
}): string {
  const { profileItems, matchedMemories, recentChat, requestText } = params;

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

  return `<profile>
${profileBlock}
</profile>
<memories>
${memoriesBlock}
</memories>
<recent_chat>
${recentBlock}
</recent_chat>
<request>
${requestText}
</request>`;
}

export function parseRukAiModelResponse(rawOutput: string): {
  cleanAnswer: string;
  memoryUpdate: MemoryUpdatePayload;
} {
  // Strip any <think>...</think> reasoning blocks emitted by reasoning models (e.g. gpt-oss / qwen3)
  let cleanAnswer = rawOutput.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const memoryUpdate: MemoryUpdatePayload = { save: [], delete: [] };

  const match = cleanAnswer.match(/<memory_update>([\s\S]*?)<\/memory_update>/i);
  if (match) {
    cleanAnswer = cleanAnswer.replace(/<memory_update>[\s\S]*?<\/memory_update>/gi, '').trim();
    const jsonCandidate = match[1]
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
      // Malformed JSON inside <memory_update>; safely ignore while still stripping tag
    }
  }

  // Also strip any stray unclosed <memory_update>... at end if truncated
  cleanAnswer = cleanAnswer.replace(/<memory_update>[\s\S]*$/i, '').trim();

  return {
    cleanAnswer: cleanAnswer || 'Directive acknowledged, Rukshan.',
    memoryUpdate,
  };
}
