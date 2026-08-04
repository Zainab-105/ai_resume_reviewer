/**
 * PostgREST returns an embedded to-one relation as an object and a to-many
 * relation as an array. The generated types are permissive about which, so
 * code that assumes one shape silently yields `undefined` against the other —
 * a fallback like `?? "Resume"` then hides the bug completely.
 *
 * Normalise at the boundary instead of guessing per call site.
 */
export function one<T>(relation: unknown): T | null {
  if (!relation) return null;
  if (Array.isArray(relation)) return (relation[0] as T | undefined) ?? null;
  return relation as T;
}
