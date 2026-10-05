// Publication boundary only. Canonical storage and private audit exports stay
// exact. Sanitized copies cannot validate original content hashes or offsets.
export const SANITIZATION_VERSION = 'shareable-export-v1';
const marker = '[REDACTED]';
const patterns = [
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['provider-key', /\b(?:sk-(?:proj-|ant-api\d+-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/g],
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['bearer-token', /\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*/gi],
  ['jwt', /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{12,}\b/g],
];
const credential = /^(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|authorization|cookie|set-cookie|aws[_-]?secret[_-]?access[_-]?key)$/i;
const placeholder = value => /^(?:\.\.\.|<[^>]+>|YOUR_[A-Z_]+|REPLACE_ME|\$\{[^}]+\})$/.test(value);

export function sanitizeText(text, counts = {}) {
  const add = kind => { counts[kind] = (counts[kind] || 0) + 1; return marker; };
  for (const [kind, expression] of patterns) text = text.replace(expression, () => add(kind));
  // Credential-bearing query strings, including HTML entity separators.
  text = text.replace(/([?&]|&amp;)(api[_-]?key|key|token|access_token|auth|signature|sig|x-amz-signature|x-amz-credential)=([^&#\s"'<>\\]+)/gi,
    (whole, separator, key, value) => value === marker || value === '%5BREDACTED%5D' || placeholder(value) ? whole : `${separator}${key}=${add('url-credential')}`);
  // Assignments in raw HTML/JS and escaped JSON inside native request payloads.
  text = text.replace(/((?:\\?["'])(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|authorization)(?:\\?["'])\s*[:=]\s*(?:\\?["']))([^"'\\\r\n]+)(?=\\?["'])/gi,
    (whole, prefix, value) => value === marker || !value.trim() || placeholder(value) ? whole : prefix + add('credential-assignment'));
  text = text.replace(/(https?:\/\/)[^\s/@:"'<>\\]+:[^\s/@"'<>\\]+@/gi, (_, scheme) => `${scheme}${add('url-userinfo')}@`);
  return text;
}

export function sanitizeExport(record) {
  const counts = {};
  const walk = (value, key = '') => {
    if (typeof value === 'string') {
      if (credential.test(key) && value && value !== marker && !placeholder(value)) { counts['credential-field'] = (counts['credential-field'] || 0) + 1; return marker; }
      return sanitizeText(value, counts);
    }
    if (Array.isArray(value)) return value.map(item => walk(item));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, walk(item, name)]));
    return value;
  };
  const copy = walk(record);
  copy.sanitization = { policy: SANITIZATION_VERSION, redactions: counts,
    canonical: false, integrity: 'Original hashes and source offsets refer to private canonical data; redacted content is not an exact replay.',
    coverage: 'Pattern-based credential redaction, not a guarantee that arbitrary secrets or personal data are absent.' };
  return copy;
}
