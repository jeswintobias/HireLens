/**
 * Prompt-injection guard for untrusted resume text.
 *
 * Layer 1 – sanitize: Unicode-normalize, strip invisible / control / bidi
 *           characters, neutralize fake prompt delimiters, cap length.
 * Layer 2 – detect:   pattern list grouped by attack category, matched on a
 *           normalized copy (lowercase, leetspeak folded) and on a
 *           letters-only copy (catches "i g n o r e" style spacing).
 *
 * Layer 3 – hidden text: text that is in the file but invisible to a human
 *           (white-on-white, tiny font, off-page, covered) is removed by the
 *           extractor before this point and reported here as "hidden_text",
 *           together with any injection patterns found inside it.
 *
 * Detection never blocks a profile. It flags it so the agent lowers
 * confidence and surfaces a warning. The real defence is architectural: the
 * LLM cannot set the score or decision (see scoring engine + decision policy).
 */

export type InjectionCategory =
  | "instruction_override"
  | "role_hijack"
  | "score_manipulation"
  | "prompt_exfiltration"
  | "tool_abuse"
  | "delimiter_escape"
  | "hidden_text";

export interface InjectionSignal {
  category: InjectionCategory;
  excerpt: string;
}

export interface SanitizedResume {
  text: string;
  truncated: boolean;
  suspected: boolean;
  signals: InjectionSignal[];
}

export const MAX_RESUME_CHARS = 12_000;

const INVISIBLE_CHARS =
  /[­᠎​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;
// Control characters except tab (\x09) and newline (\x0A).
const CONTROL_CHARS = /[\x00-\x08\x0B-\x1F\x7F]/g;
// Anything that looks like a chat/prompt delimiter tag.
const DELIMITER_TAGS =
  /<\s*\/?\s*(untrusted_resume|system|assistant|user|developer|instructions?|prompt|tool|function_call)\b[^>]*>/gi;

const PATTERNS: { category: InjectionCategory; re: RegExp }[] = [
  {
    category: "instruction_override",
    re: /\b(ignore|disregard|forget|override|bypass|skip)\b.{0,40}\b(previous|prior|above|earlier|all|any|your|the|system)\b.{0,30}\b(instructions?|prompts?|rules|directions|guidelines|context|criteria)\b/,
  },
  { category: "instruction_override", re: /\b(new|updated|real|actual) (instructions?|task|rules)\s*:/ },
  { category: "role_hijack", re: /\byou are (now|no longer|actually)\b/ },
  { category: "role_hijack", re: /^\s*(system|assistant|developer)\s*:/m },
  {
    category: "role_hijack",
    re: /\b(act|behave|pretend|respond) as\b.{0,30}\b(admin|system|developer|evaluator|recruiter|hiring manager)\b/,
  },
  {
    category: "score_manipulation",
    re: /\b(give|assign|set|rate|mark|output|return)\b.{0,40}\b(score|rating|confidence|recommend(ed|ation)?|shortlist(ed)?)\b.{0,30}(\b1(\.0+)?\b|100 ?%|\bmax(imum)?\b|\bhighest\b|\bperfect\b|\btrue\b)/,
  },
  {
    category: "score_manipulation",
    re: /\b(must|should|always|definitely)\b.{0,15}\b(be )?(recommended|shortlisted|hired|selected)\b/,
  },
  {
    category: "score_manipulation",
    re: /\bthis (candidate|applicant|resume) (is|must be) (the best|perfect|a perfect match|recommended)\b/,
  },
  {
    category: "prompt_exfiltration",
    re: /\b(reveal|print|show|repeat|output|leak)\b.{0,30}\b(system prompt|your instructions|the prompt|api key|secret|password)\b/,
  },
  {
    category: "tool_abuse",
    re: /\b(call|invoke|use|run)\b.{0,20}\b(submit_recommendation|score_profile|match_profile|parse_resume|function call|tool call)\b/,
  },
];

const LETTERS_ONLY_PHRASES: { category: InjectionCategory; phrase: string }[] = [
  { category: "instruction_override", phrase: "ignoreallpreviousinstructions" },
  { category: "instruction_override", phrase: "ignorepreviousinstructions" },
  { category: "instruction_override", phrase: "ignoreallinstructions" },
  { category: "instruction_override", phrase: "disregardpreviousinstructions" },
  { category: "instruction_override", phrase: "disregardallinstructions" },
  { category: "prompt_exfiltration", phrase: "revealthesystemprompt" },
  { category: "prompt_exfiltration", phrase: "revealyoursystemprompt" },
];

const LEET: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s",
};

function foldForDetection(text: string): string {
  return text
    .toLowerCase()
    .replace(/[013457@$]/g, (c) => LEET[c])
    .replace(/[ \t]+/g, " ");
}

function excerptAround(text: string, index: number, length: number) {
  const start = Math.max(0, index - 10);
  return text.slice(start, Math.min(text.length, index + length + 10)).trim().slice(0, 120);
}

/** Text the extractor found in the file but a human would not see. */
export interface HiddenTextRun {
  reason: string;
  text: string;
}

const MAX_HIDDEN_SIGNALS = 5;

export function sanitizeResumeText(raw: string, hidden: HiddenTextRun[] = []): SanitizedResume {
  let text = raw.normalize("NFKC").replace(INVISIBLE_CHARS, "").replace(CONTROL_CHARS, " ");

  const signals: InjectionSignal[] = [];

  // Neutralize fake delimiters so the resume can never "close" its data block.
  text = text.replace(DELIMITER_TAGS, (m) => {
    signals.push({ category: "delimiter_escape", excerpt: m.slice(0, 60) });
    return "[removed-tag]";
  });

  text = text
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const truncated = text.length > MAX_RESUME_CHARS;
  if (truncated) text = text.slice(0, MAX_RESUME_CHARS);

  signals.push(...detectInjection(text));

  if (hidden.length > 0) {
    for (const run of hidden.slice(0, MAX_HIDDEN_SIGNALS)) {
      signals.push({ category: "hidden_text", excerpt: `${run.reason}: ${run.text}`.slice(0, 120) });
    }
    if (hidden.length > MAX_HIDDEN_SIGNALS) {
      signals.push({ category: "hidden_text", excerpt: `…and ${hidden.length - MAX_HIDDEN_SIGNALS} more hidden text runs` });
    }
    // Name what the hidden text was trying to do (it never reaches the AI).
    const hiddenText = hidden.map((h) => h.text).join("\n").normalize("NFKC").replace(INVISIBLE_CHARS, "");
    for (const s of detectInjection(hiddenText)) {
      signals.push({ category: s.category, excerpt: `(hidden) ${s.excerpt}`.slice(0, 120) });
    }
  }
  return { text, truncated, suspected: signals.length > 0, signals };
}

export function detectInjection(text: string): InjectionSignal[] {
  const folded = foldForDetection(text);
  // Leet folding turns digits into letters ("1.0" → "i.o"), so patterns that
  // look for numbers (score manipulation) are also run on a plain copy.
  const plain = text.toLowerCase().replace(/[ \t]+/g, " ");
  const signals: InjectionSignal[] = [];
  const seen = new Set<string>();

  for (const { category, re } of PATTERNS) {
    const m = re.exec(folded) ?? re.exec(plain);
    if (m && !seen.has(category + m[0])) {
      seen.add(category + m[0]);
      signals.push({ category, excerpt: excerptAround(text, m.index, m[0].length) });
    }
  }

  const lettersOnly = folded.replace(/[^a-z]/g, "");
  for (const { category, phrase } of LETTERS_ONLY_PHRASES) {
    if (lettersOnly.includes(phrase) && !signals.some((s) => s.category === category)) {
      signals.push({ category, excerpt: `(obfuscated) ${phrase}` });
    }
  }
  return signals;
}

/** Wraps sanitized resume text as clearly-delimited untrusted data. */
export function wrapUntrusted(text: string): string {
  return `<untrusted_resume>\n${text}\n</untrusted_resume>`;
}
