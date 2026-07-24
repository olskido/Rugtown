/**
 * Client-side city-chat sanitization (Phase 10J).
 * Server-side DM safety lives in rt_safety_check_message.
 * City chat remains ephemeral Realtime broadcast — this only hardens display/send.
 */

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g;
const HTML_TAGS = /<\/?[a-z][^>]*>/gi;
const SCRIPTISH = /javascript:|data:text\/html|vbscript:/i;
const SEED_PHRASE = /\b(seed\s*phrase|private\s*key|secret\s*recovery|mnemonic|12\s*words|24\s*words)\b/i;
const FAKE_SUPPORT = /\b(official\s*support|verify\s*wallet|airdrop\s*claim|connect\s*wallet\s*to\s*(claim|verify))\b/i;
const DANGEROUS_SCHEME = /\b(javascript|data|vbscript|file):/i;

export interface ChatSafetyResult {
  ok: boolean;
  safeText: string;
  reason?: string;
}

/** Normalize and reject clearly dangerous city-chat content before broadcast. */
export function sanitizeCityChat(raw: string, maxLen = 140): ChatSafetyResult {
  let text = String(raw ?? '')
    .normalize('NFKC')
    .replace(CONTROL_CHARS, '')
    .replace(HTML_TAGS, '')
    .trim();

  if (!text) return { ok: false, safeText: '', reason: 'empty' };
  if (text.length > maxLen) text = text.slice(0, maxLen);

  if (SCRIPTISH.test(text) || DANGEROUS_SCHEME.test(text)) {
    return { ok: false, safeText: '', reason: 'unsafe_scheme' };
  }
  if (SEED_PHRASE.test(text)) {
    return { ok: false, safeText: '', reason: 'seed_phrase' };
  }
  if (FAKE_SUPPORT.test(text)) {
    return { ok: false, safeText: '', reason: 'scam_language' };
  }

  // Collapse runaway character spam (aaaaaaa → aaaa)
  text = text.replace(/(.)\1{5,}/g, '$1$1$1$1');

  return { ok: true, safeText: text };
}

/** Escape text for safe DOM textContent paths (never use as HTML). */
export function escapeForDisplay(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
