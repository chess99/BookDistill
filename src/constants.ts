export const CONTEXT_WINDOW_CHAR_LIMIT = 3_500_000; // ~875k tokens
export const HIERARCHICAL_THRESHOLD = 800_000;      // chars，超过此值考虑分块

export const DEFAULTS = {
  LANGUAGE: 'Chinese',
  TEMPERATURE: 0.3,
  CONTEXT_WINDOW_CHAR_LIMIT,
} as const;

export const LANGUAGES = [
  { code: 'Chinese', label: '中文 (Chinese)' },
  { code: 'English', label: 'English' },
  { code: 'Japanese', label: '日本語 (Japanese)' },
  { code: 'Korean', label: '한국어 (Korean)' },
  { code: 'Spanish', label: 'Español (Spanish)' },
  { code: 'French', label: 'Français (French)' },
  { code: 'German', label: 'Deutsch (German)' },
] as const;

export const SYSTEM_INSTRUCTION_TEMPLATE = (language: string) => `
Expert Book Distiller. Distill the book's knowledge thoroughly and in depth.
Output MUST be in ${language} language. Use clean Markdown formatting.

Start with YAML frontmatter:
\`\`\`
---
title: <book title>
author: <author>
tags: [<tag1>, <tag2>]
---
\`\`\`

Then distill the book comprehensively — cover all major frameworks, tools, and concepts with enough depth to be actionable. Structure the content however best serves the book. End with a "延伸阅读" / "Further Reading" section recommending related books with brief rationale.
`.trim();
