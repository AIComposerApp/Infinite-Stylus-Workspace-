/**
 * Privacy & PII Guardrails Engine for Thoughtspace
 * Performs edge client-side prescreening before thought dumps are shared to the live feed.
 * Detects credit cards, bank account/routing numbers, phone numbers, email addresses,
 * national IDs, API keys/passwords, and explicit content.
 */

export interface PiiFinding {
  type: 'email' | 'phone' | 'credit_card' | 'bank_routing' | 'ssn' | 'secret_token' | 'explicit';
  label: string;
  snippet: string;
  index: number;
}

export interface PiiScanResult {
  hasPii: boolean;
  hasExplicit: boolean;
  findings: PiiFinding[];
  summary: string;
}

// Luhn check for valid credit card numbers
function passesLuhnCheck(digitsOnly: string): boolean {
  if (digitsOnly.length < 13 || digitsOnly.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digitsOnly.length - 1; i >= 0; i--) {
    let digit = parseInt(digitsOnly.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

// Regex patterns for sensitive data
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{4}\b/g;
const SSN_REGEX = /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/g;
const IBAN_REGEX = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;
const API_KEY_REGEX = /\b(AIza[0-9A-Za-z-_]{35}|sk-[a-zA-Z0-9]{24,}|ghp_[a-zA-Z0-9]{36}|Bearer\s+[a-zA-Z0-9._-]{20,})\b/g;
const PASSWORD_ASSIGNMENT_REGEX = /\b(password|passwd|pwd|secret)\s*[:=]\s*["']?([^\s"']{4,})["']?/gi;

// Explicit or severely inappropriate harassment tokens
const EXPLICIT_KEYWORDS = [
  'kill yourself',
  'suicide instructions',
  'doxx',
  'swatting',
];

/**
 * Scans a combined string of text for PII and explicit terms.
 */
export function scanForPiiAndSensitiveContent(text: string): PiiScanResult {
  const findings: PiiFinding[] = [];
  let hasExplicit = false;

  if (!text || !text.trim()) {
    return {
      hasPii: false,
      hasExplicit: false,
      findings: [],
      summary: 'Clean: No sensitive text detected.',
    };
  }

  // 1. Scan for emails
  let match: RegExpExecArray | null;
  const emailRegex = new RegExp(EMAIL_REGEX.source, 'g');
  while ((match = emailRegex.exec(text)) !== null) {
    findings.push({
      type: 'email',
      label: 'Email Address',
      snippet: match[0],
      index: match.index,
    });
  }

  // 2. Scan for phone numbers (filter out small integers or years)
  const phoneRegex = new RegExp(PHONE_REGEX.source, 'g');
  while ((match = phoneRegex.exec(text)) !== null) {
    const raw = match[0].trim();
    const digits = raw.replace(/\D/g, '');
    // Minimum 10 digits for a phone number or 7 digits with dash
    if (digits.length >= 10 && digits.length <= 15) {
      // Don't flag timestamps like 2026-09-15
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        findings.push({
          type: 'phone',
          label: 'Phone Number',
          snippet: raw,
          index: match.index,
        });
      }
    }
  }

  // 3. Scan for Social Security Numbers
  const ssnRegex = new RegExp(SSN_REGEX.source, 'g');
  while ((match = ssnRegex.exec(text)) !== null) {
    findings.push({
      type: 'ssn',
      label: 'National ID / SSN',
      snippet: match[0],
      index: match.index,
    });
  }

  // 4. Scan for Credit Card numbers
  const cardCandidateRegex = /\b(?:\d{4}[- ]?){3}\d{4}\b|\b\d{13,19}\b/g;
  while ((match = cardCandidateRegex.exec(text)) !== null) {
    const raw = match[0].trim();
    const digits = raw.replace(/\D/g, '');
    if (passesLuhnCheck(digits)) {
      findings.push({
        type: 'credit_card',
        label: 'Payment Card Number',
        snippet: raw.slice(0, 4) + ' •••• •••• ' + raw.slice(-4),
        index: match.index,
      });
    }
  }

  // 5. Scan for Bank IBAN numbers
  const ibanRegex = new RegExp(IBAN_REGEX.source, 'g');
  while ((match = ibanRegex.exec(text)) !== null) {
    findings.push({
      type: 'bank_routing',
      label: 'Bank Account (IBAN)',
      snippet: match[0],
      index: match.index,
    });
  }

  // 6. Scan for API Keys & Credentials
  const apiKeyRegex = new RegExp(API_KEY_REGEX.source, 'g');
  while ((match = apiKeyRegex.exec(text)) !== null) {
    findings.push({
      type: 'secret_token',
      label: 'API Key / Secret Token',
      snippet: match[0].slice(0, 6) + '••••••••',
      index: match.index,
    });
  }

  const pwdRegex = new RegExp(PASSWORD_ASSIGNMENT_REGEX.source, 'gi');
  while ((match = pwdRegex.exec(text)) !== null) {
    findings.push({
      type: 'secret_token',
      label: 'Password / Credential',
      snippet: match[1] + ': ••••••••',
      index: match.index,
    });
  }

  // 7. Explicit / Dangerous content screening
  const lowerText = text.toLowerCase();
  for (const keyword of EXPLICIT_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      hasExplicit = true;
      findings.push({
        type: 'explicit',
        label: 'Explicit / Policy-Violating Content',
        snippet: keyword,
        index: lowerText.indexOf(keyword),
      });
    }
  }

  const hasPii = findings.some((f) => f.type !== 'explicit');

  let summary = 'Clean';
  if (hasExplicit) {
    summary = 'Explicit content detected. Review or make edits.';
  } else if (hasPii) {
    summary = 'Private information detected. Review or make edits.';
  }

  return {
    hasPii,
    hasExplicit,
    findings,
    summary,
  };
}

/**
 * Aggregates all human-readable content on the canvas into a coherent text body for prescreening
 */
export function aggregateCanvasTextContent(
  canvasTexts: Array<{ text: string }>,
  thoughts: Array<{ text?: string; response?: string; prompt?: string }>,
  checklists: Array<{ title: string; items: Array<{ text: string }> }>
): string {
  const parts: string[] = [];

  // 1. Canvas text blocks
  for (const t of canvasTexts) {
    if (t.text && t.text.trim()) {
      parts.push(t.text.trim());
    }
  }

  // 2. User thoughts / prompts
  for (const th of thoughts) {
    if (th.prompt && th.prompt.trim()) {
      parts.push(th.prompt.trim());
    }
    if (th.text && th.text.trim()) {
      parts.push(th.text.trim());
    } else if (th.response && th.response.trim()) {
      parts.push(th.response.trim());
    }
  }

  // 3. Checklists
  for (const ch of checklists) {
    if (ch.title && ch.title.trim()) {
      parts.push(ch.title.trim());
    }
    for (const item of ch.items) {
      if (item.text && item.text.trim()) {
        parts.push(item.text.trim());
      }
    }
  }

  return parts.join('\n\n');
}

/**
 * Sanitizes detected PII from raw text by redacting emails, phones, and credentials
 */
export function sanitizeTextContent(text: string): string {
  let sanitized = text;

  // Redact emails
  sanitized = sanitized.replace(EMAIL_REGEX, '[redacted email]');
  // Redact phones
  sanitized = sanitized.replace(PHONE_REGEX, '[redacted phone]');
  // Redact SSN
  sanitized = sanitized.replace(SSN_REGEX, '[redacted ID]');
  // Redact credentials
  sanitized = sanitized.replace(API_KEY_REGEX, '[redacted key]');
  sanitized = sanitized.replace(PASSWORD_ASSIGNMENT_REGEX, '$1: [redacted]');

  return sanitized;
}
