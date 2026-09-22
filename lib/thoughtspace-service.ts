import {
  collection,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  increment,
  Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { STORAGE_KEYS } from './constants';

export interface SharedThoughtDocument {
  id: string;
  title: string;
  summary: string;
  category: string;
  duration: string;
  authorAnonymousId: string;
  authorName?: string;
  remixCount?: number;
  expiresAt: number;
  createdAt: number;
  reactionCount: number;
  reactions: {
    resonate?: number;
    inspire?: number;
    reflect?: number;
    empathy?: number;
    [key: string]: number | undefined;
  };
  strokesCount: number;
  canvasPayload: string;
}

export type ReactionType = 'resonate' | 'inspire' | 'reflect' | 'empathy';

export const REACTION_CONFIG: Record<ReactionType, { label: string; icon: string; desc: string }> = {
  resonate: { label: 'Resonates', icon: '💡', desc: 'Echoes my own thoughts' },
  inspire: { label: 'Inspires', icon: '⚡', desc: 'Sparked a new direction' },
  reflect: { label: 'Reflective', icon: '🌊', desc: 'Made me pause & ponder' },
  empathy: { label: 'Empathy', icon: '🫂', desc: 'I feel this deeply' },
};

/**
 * Retrieves or generates a secure, purely anonymous client token with ZERO personal info.
 */
export function getAnonymousAuthorId(): string {
  if (typeof window === 'undefined') return 'anon_server';
  const key = STORAGE_KEYS.ANONYMOUS_ID;
  let id = localStorage.getItem(key);
  if (!id) {
    const randomBytes = Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
    id = `anon_${randomBytes}`;
    localStorage.setItem(key, id);
  }
  return id;
}

/**
 * Calculates expiration timestamp based on selected retention window.
 */
export function calculateExpiration(duration: string): number {
  const now = Date.now();
  switch (duration) {
    case '24h':
      return now + 24 * 60 * 60 * 1000;
    case '3d':
      return now + 3 * 24 * 60 * 60 * 1000;
    case '1m':
      return now + 30 * 24 * 60 * 60 * 1000;
    case '1w':
    default:
      return now + 7 * 24 * 60 * 60 * 1000;
  }
}

/**
 * Derives a thematic category from the thought dump's text and summary.
 */
export function deriveCategoryFromSummary(title: string, summary: string): string {
  const text = `${title} ${summary}`.toLowerCase();
  if (text.includes('code') || text.includes('bug') || text.includes('api') || text.includes('tech')) return 'Engineering';
  if (text.includes('design') || text.includes('art') || text.includes('creative') || text.includes('drawing')) return 'Creative Vision';
  if (text.includes('feel') || text.includes('life') || text.includes('anxiety') || text.includes('mind') || text.includes('calm')) return 'Introspection';
  if (text.includes('work') || text.includes('career') || text.includes('strategy') || text.includes('product') || text.includes('build')) return 'Ventures & Work';
  if (text.includes('book') || text.includes('learn') || text.includes('philosophy') || text.includes('study')) return 'Philosophy & Study';
  return 'Unfiltered Stream';
}

/**
 * Publishes a thought dump to the global anonymous live feed.
 */
export async function publishThoughtDumpToFirestore(payload: {
  title: string;
  summary: string;
  duration: string;
  strokesCount: number;
  canvasPayload: string;
}): Promise<string> {
  const path = 'sharedThoughts';
  try {
    const anonId = getAnonymousAuthorId();
    const thoughtId = `thought_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const expiresAt = calculateExpiration(payload.duration);
    const category = deriveCategoryFromSummary(payload.title, payload.summary);

    const docRef = doc(db, path, thoughtId);
    const docData: SharedThoughtDocument = {
      id: thoughtId,
      title: (payload.title || 'Untitled Thought').slice(0, 100),
      summary: (payload.summary || 'Anonymous thought dump stream.').slice(0, 500),
      category,
      duration: payload.duration,
      authorAnonymousId: anonId,
      expiresAt,
      createdAt: Date.now(),
      reactionCount: 0,
      reactions: {
        resonate: 0,
        inspire: 0,
        reflect: 0,
        empathy: 0,
      },
      strokesCount: payload.strokesCount,
      canvasPayload: payload.canvasPayload,
    };

    await setDoc(docRef, docData);

    // Save to locally authored thoughts list for reaction notifications
    if (typeof window !== 'undefined') {
      try {
        const authoredKey = STORAGE_KEYS.MY_AUTHORED_THOUGHTS;
        const existing = JSON.parse(localStorage.getItem(authoredKey) || '[]');
        existing.push(thoughtId);
        localStorage.setItem(authoredKey, JSON.stringify(existing));
      } catch {
        // ignore storage error
      }
    }

    return thoughtId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    return '';
  }
}

/**
 * Subscribes to real-time live feed of active anonymous thoughts.
 */
export function subscribeToLiveFeed(
  callback: (thoughts: SharedThoughtDocument[]) => void
): Unsubscribe {
  const path = 'sharedThoughts';
  const q = query(collection(db, path), orderBy('createdAt', 'desc'), limit(40));

  return onSnapshot(
    q,
    (snapshot) => {
      const now = Date.now();
      const results: SharedThoughtDocument[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as SharedThoughtDocument;
        // Only include non-expired thoughts
        if (data.expiresAt > now) {
          results.push({ ...data, id: docSnap.id });
        }
      });
      callback(results);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

/**
 * Sends an anonymous reaction to a shared thought dump.
 */
export async function sendThoughtReaction(
  thoughtId: string,
  reactionType: ReactionType
): Promise<void> {
  const thoughtPath = `sharedThoughts/${thoughtId}`;
  const reactionPath = `sharedThoughts/${thoughtId}/reactions`;

  try {
    const anonId = getAnonymousAuthorId();
    const reactionId = `react_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // 1. Log individual reaction event
    const subDocRef = doc(db, reactionPath, reactionId);
    await setDoc(subDocRef, {
      thoughtId,
      reactionType,
      authorAnonymousId: anonId,
      createdAt: Date.now(),
    });

    // 2. Increment counters on main document
    const mainDocRef = doc(db, 'sharedThoughts', thoughtId);
    await updateDoc(mainDocRef, {
      reactionCount: increment(1),
      [`reactions.${reactionType}`]: increment(1),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, thoughtPath);
  }
}
