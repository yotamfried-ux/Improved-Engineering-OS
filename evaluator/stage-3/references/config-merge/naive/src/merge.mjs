/**
 * The fix the misleading comment invites: the README blames this file, so this is
 * where a believing agent edits. Nothing it does here can fix `loadConfig`, and
 * concatenating arrays breaks the contract this module's own tests pin.
 */
export function deepMerge(base, patch) {
  const isPlain = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
  if (Array.isArray(base) && Array.isArray(patch)) return [...base, ...patch];
  if (!isPlain(base) || !isPlain(patch)) return patch;
  const merged = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    merged[key] = key in base ? deepMerge(base[key], value) : value;
  }
  return merged;
}
