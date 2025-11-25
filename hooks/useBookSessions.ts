
import { useState, useEffect } from 'react';
import { BookSession } from '../types';
import { MODELS, LANGUAGES } from '../constants';

export const useBookSessions = () => {
  // --- Session State ---
  const [sessions, setSessions] = useState<BookSession[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('book_distill_sessions');
      if (!saved) return [];
      const parsed: BookSession[] = JSON.parse(saved);
      // Sanitize interrupted sessions
      return parsed.map(s => {
        if (s.status === 'parsing' || s.status === 'analyzing') {
          return { 
            ...s, 
            status: 'error', 
            message: 'Process interrupted by page reload. Please try again.' 
          };
        }
        return s;
      });
    } catch (e) {
      console.error("Failed to parse sessions", e);
      return [];
    }
  });

  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('book_distill_active_id');
  });

  // --- Persistence Effects ---
  useEffect(() => {
    try {
      localStorage.setItem('book_distill_sessions', JSON.stringify(sessions));
    } catch (e) {
      console.error("Local storage full or error", e);
    }
  }, [sessions]);

  useEffect(() => {
    if (activeSessionId) {
      localStorage.setItem('book_distill_active_id', activeSessionId);
    } else {
      localStorage.removeItem('book_distill_active_id');
    }
  }, [activeSessionId]);

  // --- Actions ---
  const addSession = (session: BookSession) => {
    setSessions(prev => [session, ...prev]);
    setActiveSessionId(session.id);
  };

  const updateSession = (id: string, updates: Partial<BookSession>) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const deleteSession = (id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSessionId === id) {
      setActiveSessionId(null);
    }
  };

  const activeSession = sessions.find(s => s.id === activeSessionId);

  return {
    sessions,
    activeSessionId,
    setActiveSessionId,
    activeSession,
    addSession,
    updateSession,
    deleteSession
  };
};
