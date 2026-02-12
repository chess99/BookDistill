
import { parseEpub } from '../services/epubService';
import { GoogleGenAI } from '@google/genai';
import { CONTEXT_WINDOW_CHAR_LIMIT } from '../constants';
import { BookSession } from '../types';

interface UseBookProcessorProps {
  addSession: (session: BookSession) => void;
  updateSession: (id: string, updates: Partial<BookSession>) => void;
  getApiKey: () => string;
}

export const useBookProcessor = ({ addSession, updateSession, getApiKey }: UseBookProcessorProps) => {

  const processBook = async (file: File, language: string, modelId: string) => {
    if (!file.name.endsWith('.epub')) {
      alert("Please upload a valid .epub file");
      return;
    }

    const newId = Date.now().toString();

    // 1. Create Initial Session
    const newSession: BookSession = {
      id: newId,
      metadata: null,
      summary: '',
      status: 'parsing',
      message: 'Extracting text from EPUB...',
      timestamp: Date.now(),
      language,
      model: modelId
    };
    addSession(newSession);

    try {
      // 2. Parse EPUB
      const { text, title, author } = await parseEpub(file);
      
      updateSession(newId, {
        metadata: { title, author, rawTextLength: text.length }
      });

      // 3. Check Limits
      if (text.length > CONTEXT_WINDOW_CHAR_LIMIT) {
        updateSession(newId, { 
          status: 'error', 
          message: `The book is too long (${(text.length/1000000).toFixed(1)}M chars). It exceeds the model's context window.` 
        });
        return;
      }

      // 4. Generate Summary
      await generateSummary(newId, text, title, author, language, modelId);

    } catch (e: any) {
      updateSession(newId, { status: 'error', message: `Failed to parse EPUB: ${e.message}` });
    }
  };

  const generateSummary = async (sessionId: string, text: string, title: string, author: string, language: string, modelId: string) => {
    const apiKey = getApiKey().trim();
    if (!apiKey) {
      updateSession(sessionId, { status: 'error', message: 'Gemini API Key is required. Please add it in the upload page settings.' });
      return;
    }

    updateSession(sessionId, { status: 'analyzing', message: `Sending to ${modelId} for deep analysis in ${language}...` });

    try {
      const ai = new GoogleGenAI({ apiKey });
      
      // Minimalist System Instruction matching AI Studio experience
      // We only strictly enforce Language and Markdown format.
      // We let the model decide the structure ("Detailed knowledge extraction").
      const systemInstruction = `
        Expert Book Distiller.
        Task: Extract detailed knowledge and insights from the provided book.
        Constraint 1: Output MUST be in ${language} language.
        Constraint 2: Use clean Markdown formatting.
      `.trim();

      const responseStream = await ai.models.generateContentStream({
        model: modelId,
        contents: [
          {
            role: 'user',
            parts: [
              { text: `Title: ${title}\nAuthor: ${author}\n\n${text}` }
            ]
          }
        ],
        config: { 
          temperature: 0.3,
          systemInstruction: systemInstruction
        }
      });

      let fullText = '';
      
      for await (const chunk of responseStream) {
        const chunkText = chunk.text;
        if (chunkText) {
          fullText += chunkText;
          updateSession(sessionId, { summary: fullText, status: 'analyzing' });
        }
      }

      updateSession(sessionId, { status: 'complete' });

    } catch (e: any) {
      console.error(e);
      updateSession(sessionId, { status: 'error', message: `Gemini API Error: ${e.message}` });
    }
  };

  return { processBook };
};
