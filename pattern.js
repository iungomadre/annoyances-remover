// A picked element is remembered as a pattern: its structure and words flattened
// into tokens, e.g. ["<div>", "[role=alert]", "<span>", "Bob", "is", "presenting", "</span>", "</div>"].
// Picking the same thing again merges the two, replacing whatever differs with a
// wildcard (null), so ["<div>", "[role=alert]", "<span>", null, "is", "presenting", "</span>", "</div>"]
// matches any name.

// Picks larger than this are matched by position on the page instead.
const MAX_TOKENS = 300;
const SKIPPED_TAGS = new Set(["script", "style", "template", "noscript"]);

// Stops collecting once past limit, so callers can cheaply reject large elements.
function tokenize(element, limit = Infinity) {
  const tokens = [];
  const visit = (node) => {
    if (tokens.length > limit) return;
    if (node.nodeType === Node.TEXT_NODE) {
      for (const word of node.nodeValue.split(/\s+/)) {
        if (word) tokens.push(word);
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || SKIPPED_TAGS.has(node.localName)) return;
    tokens.push(`<${node.localName}>`);
    const role = node.getAttribute("role");
    if (role) tokens.push(`[role=${role}]`);
    for (const child of node.childNodes) visit(child);
    tokens.push(`</${node.localName}>`);
  };
  visit(element);
  return tokens;
}

function isWord(token) {
  return token !== null && !token.startsWith("<") && !token.startsWith("[role=");
}

function patternSegments(pattern) {
  const segments = [[]];
  for (const token of pattern) {
    if (token === null) segments.push([]);
    else segments.at(-1).push(token);
  }
  return segments;
}

function matchesPattern(tokens, pattern) {
  const segments = patternSegments(pattern);
  const startsAt = (segment, position) => segment.every((token, i) => tokens[position + i] === token);
  const first = segments[0];
  const last = segments.at(-1);
  if (segments.length === 1) return tokens.length === first.length && startsAt(first, 0);
  if (tokens.length < first.length + last.length) return false;
  if (!startsAt(first, 0) || !startsAt(last, tokens.length - last.length)) return false;

  let position = first.length;
  const end = tokens.length - last.length;
  for (const segment of segments.slice(1, -1)) {
    while (position + segment.length <= end && !startsAt(segment, position)) position++;
    if (position + segment.length > end) return false;
    position += segment.length;
  }
  return true;
}

// Keeps the longest common subsequence of both and turns every run of
// differences into a single wildcard. Existing wildcards never count as common,
// so earlier merges are preserved.
function mergeTokens(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] !== null && a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const merged = [];
  const gap = () => {
    if (merged.at(-1) !== null) merged.push(null);
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] !== null && a[i] === b[j]) {
      merged.push(a[i]);
      i++;
      j++;
    } else {
      gap();
      if (dp[i + 1][j] >= dp[i][j + 1]) i++;
      else j++;
    }
  }
  if (i < a.length || j < b.length) gap();
  return merged;
}

// The root element's opening and closing tokens always line up, so only the
// inside is merged; that keeps the root tag literal for the content script's lookup.
function mergePatterns(pattern, tokens) {
  return [pattern[0], ...mergeTokens(pattern.slice(1, -1), tokens.slice(1, -1)), pattern.at(-1)];
}

// Rejects patterns so generic they'd hide unrelated parts of the page.
function isSpecificEnough(pattern) {
  const inner = pattern.slice(1, -1).filter((token) => token !== null);
  return inner.some(isWord) || inner.length >= 4;
}

// The longest literal word, used to find candidates quickly; null when only
// structure is left to compare.
function patternAnchor(pattern) {
  return pattern.filter(isWord).reduce((longest, word) => (longest && longest.length >= word.length ? longest : word), null);
}

function describePattern(pattern) {
  const text = pattern
    .filter((token) => token === null || isWord(token))
    .map((token) => token ?? "…")
    .join(" ")
    .replace(/…( …)+/g, "…");
  const tag = pattern[0];
  if (!pattern.some(isWord)) return `${tag} (any text, matched by structure)`;
  return `${tag} "${text.length > 80 ? `${text.slice(0, 80)}…` : text}"`;
}
