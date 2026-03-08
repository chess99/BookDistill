/**
 * 统一 AI 服务层 - 支持多 provider 流式输出
 */

import { AIProviderConfig } from '../types';
import { SYSTEM_INSTRUCTION_TEMPLATE } from '../config/defaults';

export interface StreamCallbacks {
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

export async function generateSummaryStream(
  config: AIProviderConfig,
  bookTitle: string,
  bookAuthor: string,
  bookText: string,
  language: string,
  callbacks: StreamCallbacks
): Promise<void> {
  const systemPrompt = SYSTEM_INSTRUCTION_TEMPLATE(language);
  const userMessage = `Title: ${bookTitle}\nAuthor: ${bookAuthor}\n\n${bookText}`;

  try {
    switch (config.provider) {
      case 'gemini':
        await callGemini(config, systemPrompt, userMessage, callbacks);
        break;
      case 'openai':
      case 'openai_compatible':
        await callOpenAICompatible(config, systemPrompt, userMessage, callbacks);
        break;
      case 'anthropic':
        await callAnthropic(config, systemPrompt, userMessage, callbacks);
        break;
      default:
        callbacks.onError(`Unknown provider: ${config.provider}`);
    }
  } catch (e: any) {
    callbacks.onError(e.message || 'Unknown error');
  }
}

// ── Gemini ──────────────────────────────────────────────────────────────────

async function callGemini(
  config: AIProviderConfig,
  systemPrompt: string,
  userMessage: string,
  callbacks: StreamCallbacks
) {
  const { GoogleGenAI } = await import('@google/genai');
  const baseUrl = config.baseUrl?.trim() || undefined;
  const ai = new GoogleGenAI({ apiKey: config.apiKey, ...(baseUrl ? { baseUrl } : {}) });

  const responseStream = await ai.models.generateContentStream({
    model: config.model,
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    config: {
      temperature: 0.3,
      systemInstruction: systemPrompt,
    },
  });

  for await (const chunk of responseStream) {
    const text = chunk.text;
    if (text) callbacks.onChunk(text);
  }
  callbacks.onDone();
}

// ── OpenAI / OpenAI-Compatible ───────────────────────────────────────────────

async function callOpenAICompatible(
  config: AIProviderConfig,
  systemPrompt: string,
  userMessage: string,
  callbacks: StreamCallbacks
) {
  const baseUrl = (config.baseUrl?.trim() || 'https://api.openai.com').replace(/\/$/, '');
  const url = `${baseUrl}/v1/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      stream: true,
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API error ${response.status}: ${errText}`);
  }

  await readSSEStream(response, (data) => {
    if (data === '[DONE]') {
      callbacks.onDone();
      return;
    }
    try {
      const parsed = JSON.parse(data);
      const text = parsed.choices?.[0]?.delta?.content;
      if (text) callbacks.onChunk(text);
    } catch {
      // ignore malformed chunks
    }
  });
}

// ── Anthropic ────────────────────────────────────────────────────────────────

async function callAnthropic(
  config: AIProviderConfig,
  systemPrompt: string,
  userMessage: string,
  callbacks: StreamCallbacks
) {
  const baseUrl = (config.baseUrl?.trim() || 'https://api.anthropic.com').replace(/\/$/, '');
  const url = `${baseUrl}/v1/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 16000,
      stream: true,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errText}`);
  }

  await readSSEStream(response, (data) => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
        callbacks.onChunk(parsed.delta.text);
      } else if (parsed.type === 'message_stop') {
        callbacks.onDone();
      }
    } catch {
      // ignore malformed chunks
    }
  });
}

// ── SSE Stream Reader ────────────────────────────────────────────────────────

async function readSSEStream(
  response: Response,
  onData: (data: string) => void
) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        onData(line.slice(6).trim());
      }
    }
  }
}
