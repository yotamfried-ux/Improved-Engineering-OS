/**
 * The attribute allowlist and the sanitizer that reconstructs from it (D26, TD-06).
 *
 * TD-06 records something this project already learned the hard way: a denylist
 * scan was explicitly rejected as the primary control, because a scan can only
 * remove what someone thought of. The mechanism here is reconstruction, not
 * filtering -- the output object is built key by key from
 * `contracts/telemetry-attributes.yaml`, so a key nobody has declared cannot
 * reach the outbox whether or not anyone anticipated it.
 *
 * Everything dropped is counted, and counted by reason. A sanitizer that
 * silently thinned attributes would make a run with a bug in its instrumentation
 * indistinguishable from a quiet one, which is the same failure D23 forbids one
 * level up.
 *
 * Three rules beyond the allowlist itself, each closing a way a value gets past
 * a list of key names:
 *
 *   type       an allowlisted key permits a kind of fact, so a `number` key
 *              carrying a string is not that fact.
 *   max_length a value longer than its declared bound is anomalous, and the
 *              safe direction is to drop it rather than to store a prefix.
 *   secrets    a credential-shaped value is refused whatever key carries it.
 *              An allowlisted key is permission to send a kind of fact, never
 *              permission to send a secret that ended up in it.
 */

import { looksLikeSecret } from '@ieos/core';
import { parse } from 'yaml';

export type AttributeType = 'string' | 'number' | 'boolean';

export interface AttributeRule {
  readonly key: string;
  readonly type: AttributeType;
  readonly sensitivity: 'public' | 'internal';
  readonly maxLength: number;
}

export interface AttributeRegistry {
  readonly allowed: readonly AttributeRule[];
  /**
   * Keys named as forbidden, including `prefix.*` wildcards.
   *
   * They are redundant against reconstruction -- anything not allowed is
   * already dropped -- and they earn their place by being counted separately.
   * "3 unknown keys dropped" and "3 attempts to send env.* dropped" are the
   * same number and completely different findings.
   */
  readonly forbidden: readonly string[];
}

export class AttributeRegistryError extends Error {
  readonly at: string;
  constructor(message: string, at: string) {
    super(`${message} (at ${at})`);
    this.name = 'AttributeRegistryError';
    this.at = at;
  }
}

/** Why a key did not survive sanitization. */
export type DropReason =
  | 'not_in_allowlist'
  | 'forbidden'
  | 'wrong_type'
  | 'too_long'
  | 'secret_shaped'
  | 'not_scalar'
  | 'invalid_text';

export interface DroppedAttribute {
  readonly key: string;
  readonly reason: DropReason;
}

export interface SanitizedAttributes {
  readonly attributes: Record<string, string | number | boolean>;
  readonly dropped: readonly DroppedAttribute[];
}

/**
 * Parse the registry document.
 *
 * Fails loudly on a malformed or empty registry rather than yielding an empty
 * allowlist. An empty allowlist drops every attribute and looks, from the
 * outside, exactly like an agent that reported nothing.
 */
export function parseAttributeRegistry(
  text: string,
  at = 'telemetry-attributes.yaml',
): AttributeRegistry {
  let document: {
    attributes?: { key?: unknown; type?: unknown; sensitivity?: unknown; max_length?: unknown }[];
    forbidden?: { key?: unknown }[];
  };
  try {
    document = parse(text) as typeof document;
  } catch (error) {
    throw new AttributeRegistryError(
      `registry is not valid YAML: ${error instanceof Error ? error.message : String(error)}`,
      at,
    );
  }
  if (document === null || typeof document !== 'object') {
    throw new AttributeRegistryError('registry did not parse to a mapping', at);
  }
  const rawAllowed = document.attributes;
  if (!Array.isArray(rawAllowed) || rawAllowed.length === 0) {
    throw new AttributeRegistryError(
      'registry declares no attributes; an empty allowlist drops everything and is ' +
        'indistinguishable from an agent that reported nothing',
      `${at}#attributes`,
    );
  }

  const seen = new Set<string>();
  const allowed = rawAllowed.map((entry, index) => {
    const where = `${at}#attributes[${String(index)}]`;
    const key = entry.key;
    if (typeof key !== 'string' || key.trim().length === 0) {
      throw new AttributeRegistryError('attribute has no key', where);
    }
    if (seen.has(key)) {
      throw new AttributeRegistryError(`duplicate attribute key ${JSON.stringify(key)}`, where);
    }
    seen.add(key);
    const type = entry.type;
    if (type !== 'string' && type !== 'number' && type !== 'boolean') {
      throw new AttributeRegistryError(
        `attribute ${key} declares type ${JSON.stringify(type)}, which is not a scalar type`,
        where,
      );
    }
    const sensitivity = entry.sensitivity;
    if (sensitivity !== 'public' && sensitivity !== 'internal') {
      // `never` is a sensitivity for the forbidden list, not for an allowed
      // key. A key that is both allowed and never-collected is a contradiction
      // in the contract, so it stops the load rather than resolving one way.
      throw new AttributeRegistryError(
        `attribute ${key} declares sensitivity ${JSON.stringify(sensitivity)}; ` +
          'an allowed attribute is public or internal',
        where,
      );
    }
    const maxLength = entry.max_length;
    if (typeof maxLength !== 'number' || !Number.isInteger(maxLength) || maxLength <= 0) {
      throw new AttributeRegistryError(`attribute ${key} declares no positive max_length`, where);
    }
    return { key, type, sensitivity, maxLength } satisfies AttributeRule;
  });

  const forbidden = (document.forbidden ?? []).map((entry, index) => {
    const key = entry.key;
    if (typeof key !== 'string' || key.trim().length === 0) {
      throw new AttributeRegistryError(
        'forbidden entry has no key',
        `${at}#forbidden[${String(index)}]`,
      );
    }
    return key;
  });

  return { allowed, forbidden };
}

/** Whether a key matches a forbidden entry, which may be a `prefix.*` wildcard. */
export function isForbidden(key: string, forbidden: readonly string[]): boolean {
  return forbidden.some((pattern) =>
    pattern.endsWith('.*') ? key.startsWith(pattern.slice(0, -1)) : key === pattern,
  );
}

/**
 * Strict text validation before anything is scanned (D26).
 *
 * JavaScript strings are UTF-16 and can hold an unpaired surrogate, which is not
 * valid Unicode text and does not survive a round trip through UTF-8. That
 * matters here specifically: the sanitizer's later checks are pattern matches
 * over text, and a value that changes when it is encoded is a value that was
 * scanned in one form and stored in another.
 */
export function isWellFormedText(value: string): boolean {
  return value.isWellFormed();
}

/**
 * Rebuild an attribute map from the allowlist.
 *
 * The input is `unknown` on purpose. It arrives from an adapter, a hook or an
 * agent, and typing it as a clean record here would move the trust boundary to
 * whoever called this rather than keeping it in the one place that checks.
 */
export function sanitizeAttributes(
  input: unknown,
  registry: AttributeRegistry,
): SanitizedAttributes {
  const attributes: Record<string, string | number | boolean> = {};
  const dropped: DroppedAttribute[] = [];
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { attributes, dropped };
  }

  const rules = new Map(registry.allowed.map((rule) => [rule.key, rule]));
  // Sorted, so the same attributes produce the same object and the same drop
  // report regardless of the order the caller happened to build them in.
  for (const key of Object.keys(input as Record<string, unknown>).sort()) {
    const value = (input as Record<string, unknown>)[key];
    if (isForbidden(key, registry.forbidden)) {
      dropped.push({ key, reason: 'forbidden' });
      continue;
    }
    const rule = rules.get(key);
    if (rule === undefined) {
      dropped.push({ key, reason: 'not_in_allowlist' });
      continue;
    }
    if (value === null || value === undefined) {
      // A null carries no fact. Dropping it keeps "absent" and "reported as
      // nothing" from being the same row downstream.
      dropped.push({ key, reason: 'not_scalar' });
      continue;
    }
    if (typeof value === 'object') {
      dropped.push({ key, reason: 'not_scalar' });
      continue;
    }
    if (typeof value !== rule.type) {
      dropped.push({ key, reason: 'wrong_type' });
      continue;
    }
    if (typeof value === 'string') {
      if (!isWellFormedText(value)) {
        dropped.push({ key, reason: 'invalid_text' });
        continue;
      }
      if (looksLikeSecret(value)) {
        dropped.push({ key, reason: 'secret_shaped' });
        continue;
      }
      if ([...value].length > rule.maxLength) {
        dropped.push({ key, reason: 'too_long' });
        continue;
      }
      attributes[key] = value;
      continue;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        // NaN and Infinity are not facts, and they do not survive JSON.
        dropped.push({ key, reason: 'wrong_type' });
        continue;
      }
      if (String(value).length > rule.maxLength) {
        dropped.push({ key, reason: 'too_long' });
        continue;
      }
      attributes[key] = value;
      continue;
    }
    if (typeof value === 'boolean') {
      attributes[key] = value;
      continue;
    }
    // A symbol, a bigint or a function reached an allowlisted key whose
    // declared type it matched by name alone. Nothing here is a fact.
    dropped.push({ key, reason: 'not_scalar' });
  }

  return { attributes, dropped };
}

/** Drops grouped by reason, for the counter D26 asks the exporter to keep. */
export function dropCounts(dropped: readonly DroppedAttribute[]): Record<DropReason, number> {
  const counts: Record<DropReason, number> = {
    not_in_allowlist: 0,
    forbidden: 0,
    wrong_type: 0,
    too_long: 0,
    secret_shaped: 0,
    not_scalar: 0,
    invalid_text: 0,
  };
  for (const entry of dropped) counts[entry.reason] += 1;
  return counts;
}
