import { useCallback, useEffect, useReducer } from 'react';

const MOTION_QUERY = '(prefers-reduced-motion: reduce)';
export type MotionPreference = { system: boolean; user: boolean | null };
export type MotionPreferenceChange = { source: 'system' | 'user'; reduced: boolean };

export function motionPreferenceReducer(state: MotionPreference, change: MotionPreferenceChange): MotionPreference {
  if (state[change.source] === change.reduced) return state;
  return { ...state, [change.source]: change.reduced };
}

export function resolvedMotionPreference(state: MotionPreference) { return state.user ?? state.system; }

/** Follow the system until the player explicitly chooses how this game moves. */
export function useMotionPreference() {
  const [preference, dispatch] = useReducer(motionPreferenceReducer, undefined, (): MotionPreference => ({
    system: window.matchMedia(MOTION_QUERY).matches, user: null,
  }));
  useEffect(() => {
    const query = window.matchMedia(MOTION_QUERY);
    const changed = () => dispatch({ source: 'system', reduced: query.matches });
    query.addEventListener('change', changed);
    changed();
    return () => query.removeEventListener('change', changed);
  }, []);
  const setReducedMotion = useCallback((reduced: boolean) => dispatch({ source: 'user', reduced }), []);
  return [resolvedMotionPreference(preference), setReducedMotion] as const;
}
