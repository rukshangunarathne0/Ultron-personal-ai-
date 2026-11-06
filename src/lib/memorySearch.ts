import { MemoryCategory, MemoryItem, MemoryUpdatePayload } from '../types';
import { containsSensitivePrivateData } from './rukAiPrompt';

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'you', 'your', 'are', 'was',
  'were', 'have', 'has', 'had', 'not', 'but', 'what', 'when', 'where', 'who',
  'how', 'why', 'can', 'will', 'just', 'about', 'from', 'into', 'out', 'all',
  'make', 'give', 'tell', 'know', 'please', 'rukshan', 'ultron', 'ruk',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s+#.-]/g, ' ')
    .split(/\s+/)
    .filter((tok) => tok.length >= 2 && !STOP_WORDS.has(tok));
}

export function getProfileMemories(allMemories: MemoryItem[]): MemoryItem[] {
  return allMemories
    .filter((m) => m.isProfile || m.type === 'preference')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function searchRelevantMemories(
  allMemories: MemoryItem[],
  query: string,
  limit = 8
): MemoryItem[] {
  const nonProfile = allMemories.filter((m) => !m.isProfile && m.type !== 'preference');
  const pool = nonProfile.length > 0 ? nonProfile : allMemories;
  if (pool.length === 0) return [];

  const qLower = query.toLowerCase();
  // If Rukshan asks broadly about himself, his projects, or his memories, return newest relevant memories
  if (
    /\b(what do you know|about me|my memor|my project|my goal|my plan|my task|who am i|everything i told|remember about)\b/i.test(
      qLower
    )
  ) {
    return [...allMemories]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, Math.max(limit, 12));
  }

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return [...pool]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, Math.min(4, limit));
  }

  const scored = pool.map((mem) => {
    const memTokens = tokenize(`${mem.type} ${mem.text}`);
    let score = 0;

    for (const qt of queryTokens) {
      for (const mt of memTokens) {
        if (mt === qt) {
          score += 3.0;
        } else if (mt.startsWith(qt) || qt.startsWith(mt)) {
          score += 1.5;
        }
      }
    }

    // Category boosts based on query cues
    if (/\b(project|build|app|startup|working on|system|deadline)\b/i.test(qLower) && mem.type === 'project') {
      score += 2.0;
    }
    if (/\b(friend|team|brother|sister|partner|colleague|person|who is)\b/i.test(qLower) && mem.type === 'person') {
      score += 2.0;
    }
    if (/\b(decid|chose|switch|plan|architecture)\b/i.test(qLower) && mem.type === 'decision') {
      score += 2.0;
    }

    // Slight recency tie-breaker (newer wins per STEP 2 rule)
    const recencyDays =
      Math.max(0, Date.now() - new Date(mem.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
    const recencyBonus = Math.max(0.05, 0.35 - recencyDays * 0.01);

    return { mem, score: score + (score > 0 ? recencyBonus : 0) };
  });

  const hits = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.mem)
    .slice(0, limit);

  if (hits.length > 0) return hits;

  // Fallback: provide 3 most recent contextual memories so RUK-AI has continuity
  return [...pool]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 3);
}

export function shouldBeProfileFact(type: MemoryCategory, text: string): boolean {
  if (type === 'preference') return true;
  if (type !== 'fact') return false;
  return /\b(rukshan|live|from|country|city|sri lanka|negombo|developer|engineer|founder|student|creator|skill|language|stack|uses|speaks|works as|role|age)\b/i.test(
    text
  );
}

export function applyMemoryUpdate(
  existing: MemoryItem[],
  update: MemoryUpdatePayload,
  sourceMessage?: string
): {
  nextMemories: MemoryItem[];
  addedCount: number;
  deletedCount: number;
} {
  let list = [...existing];
  let deletedCount = 0;
  let addedCount = 0;

  // 1. Process deletions (exact match, substring match, or high token overlap)
  for (const rawDel of update.delete) {
    const delLower = rawDel.toLowerCase().trim();
    if (!delLower) continue;
    const delTokens = tokenize(delLower);

    const beforeLen = list.length;
    list = list.filter((item) => {
      const itemLower = item.text.toLowerCase();
      if (itemLower === delLower) return false;
      if (delLower.length >= 5 && (itemLower.includes(delLower) || delLower.includes(itemLower))) {
        return false;
      }
      if (delTokens.length >= 2) {
        const itemTokens = new Set(tokenize(itemLower));
        const overlap = delTokens.filter((t) => itemTokens.has(t)).length;
        if (overlap / delTokens.length >= 0.75) {
          return false;
        }
      }
      return true;
    });
    deletedCount += beforeLen - list.length;
  }

  // 2. Process additions (deduplicate & enforce privacy rules)
  const now = new Date().toISOString();
  for (const entry of update.save) {
    const cleanText = entry.text.trim();
    if (!cleanText || containsSensitivePrivateData(cleanText)) continue;

    const existingIdx = list.findIndex(
      (m) => m.text.toLowerCase() === cleanText.toLowerCase()
    );
    if (existingIdx >= 0) {
      // Refresh timestamp so newest wins
      list[existingIdx] = {
        ...list[existingIdx],
        type: entry.type,
        isProfile: shouldBeProfileFact(entry.type, cleanText),
        updatedAt: now,
      };
      continue;
    }

    list.unshift({
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: entry.type,
      text: cleanText,
      isProfile: shouldBeProfileFact(entry.type, cleanText),
      createdAt: now,
      updatedAt: now,
      sourceMessage,
    });
    addedCount += 1;
  }

  return { nextMemories: list, addedCount, deletedCount };
}
