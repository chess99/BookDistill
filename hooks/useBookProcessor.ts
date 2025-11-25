
import { parseEpub } from '../services/epubService';
import { GoogleGenAI } from '@google/genai';
import { CONTEXT_WINDOW_CHAR_LIMIT } from '../constants';
import { BookSession } from '../types';

interface UseBookProcessorProps {
  addSession: (session: BookSession) => void;
  updateSession: (id: string, updates: Partial<BookSession>) => void;
}

export const useBookProcessor = ({ addSession, updateSession }: UseBookProcessorProps) => {
  const apiKey = process.env.API_KEY || '';

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
    if (!apiKey) {
      updateSession(sessionId, { status: 'error', message: 'API Key not found in environment variables.' });
      return;
    }

    updateSession(sessionId, { status: 'analyzing', message: `Sending to ${modelId} for deep analysis in ${language}...` });

    try {
      const ai = new GoogleGenAI({ apiKey });
      
      const prompt = `
        You are an expert literary critic and knowledge distillier.
        Please analyze the following book: "${title}" by ${author}.
        
        Your task is to provide a comprehensive knowledge extraction.
        
        IMPORTANT: The output must be strictly in ${language}. 
        Translate all section headers and content to ${language}.

        Structure the response in Markdown format with the following sections:
        
        1. **Executive Summary**: A high-level overview of the book's core message.
        2. **Key Concepts & Ideas**: Detailed explanation of the main concepts presented.
        3. **Chapter-wise / Thematic Breakdown**: Deep dive into the structure and arguments.
        4. **Actionable Takeaways / Insights**: What can the reader learn or apply?
        5. **Notable Quotes**: Significant text from the book.

        Use proper Markdown formatting:
        - Use # for main title (if you include one)
        - Use ## for the section headers
        - Use ### for subsections
        - Use bullet points and bold text for emphasis
        - Use > for quotes

        Here is the full text of the book:
        ${text}
      `;

      const responseStream = await ai.models.generateContentStream({
        model: modelId,
        contents: prompt,
        config: { temperature: 0.3 }
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
