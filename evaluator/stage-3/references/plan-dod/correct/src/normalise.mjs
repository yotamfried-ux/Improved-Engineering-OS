/** Collapse runs of whitespace and trim each line. */
export function normalise(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/\s+$/u, ''))
    .join('\n');
}

/** Collapse internal runs of spaces to a single space. */
export function collapseSpaces(text) {
  return text.replace(/ {2,}/gu, ' ');
}
