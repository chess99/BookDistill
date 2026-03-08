
import { parserFactory } from '../services/parserFactory';
import { ParseError, AIProviderConfig } from '../types';
import { CONTEXT_WINDOW_CHAR_LIMIT } from '../constants';
import { generateSummaryStream } from '../services/aiService';
import { BookSession } from '../types';

interface UseBookProcessorProps {
  addSession: (session: BookSession) => void;
  updateSession: (id: string, updates: Partial<BookSession>) => void;
  getProviderConfig: () => AIProviderConfig;
}

export const useBookProcessor = ({ addSession, updateSession, getProviderConfig }: UseBookProcessorProps) => {

  const processBook = async (file: File, language: string) => {
    const format = parserFactory.detectFormat(file);
    if (!format) {
      const supported = parserFactory.getSupportedFormats();
      alert(`Unsupported file format. Please upload: ${supported.extensions.map(e => e.toUpperCase()).join(', ')}`);
      return;
    }

    const config = getProviderConfig();
    if (!config.apiKey.trim()) {
      alert('API key is required. Please configure it in Settings.');
      return;
    }
    if (!config.model.trim()) {
      alert('Model is required. Please configure it in Settings.');
      return;
    }

    const newId = Date.now().toString();

    const newSession: BookSession = {
      id: newId,
      metadata: null,
      summary: '',
      status: 'parsing',
      message: `Extracting text from ${format.toUpperCase()} file...`,
      timestamp: Date.now(),
      language,
      model: config.model,
    };
    addSession(newSession);

    try {
      const result = await parserFactory.parseFile(file);

      updateSession(newId, {
        metadata: {
          title: result.title,
          author: result.author,
          rawTextLength: result.text.length,
          format: result.format,
        },
      });

      if (result.text.length > CONTEXT_WINDOW_CHAR_LIMIT) {
        updateSession(newId, {
          status: 'error',
          message: `The book is too long (${(result.text.length / 1000000).toFixed(1)}M chars). It exceeds the model's context window.`,
        });
        return;
      }

      updateSession(newId, {
        status: 'analyzing',
        message: `Sending to ${config.model} for deep analysis in ${language}...`,
      });

      // Use a ref-like accumulator since updateSession doesn't support functional updates
      let accumulated = '';

      await generateSummaryStream(
        config,
        result.title,
        result.author || 'Unknown Author',
        result.text,
        language,
        {
          onChunk: (text) => {
            accumulated += text;
            updateSession(newId, { summary: accumulated, status: 'analyzing' });
          },
          onDone: () => {
            updateSession(newId, { status: 'complete' });
          },
          onError: (message) => {
            updateSession(newId, { status: 'error', message: `AI Error: ${message}` });
          },
        }
      );

    } catch (e: any) {
      if (e instanceof ParseError) {
        updateSession(newId, {
          status: 'error',
          message: `Failed to parse ${e.format.toUpperCase()}: ${e.message}`,
        });
      } else {
        updateSession(newId, {
          status: 'error',
          message: `Unexpected error: ${e.message}`,
        });
      }
    }
  };

  return { processBook };
};
