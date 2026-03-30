const SUSPICIOUS_PATTERNS = [
  /ignore\s+previous\s+instructions/gi,
  /reveal\s+system\s+prompt/gi,
  /покажи\s+системный\s+промпт/gi,
  /игнорируй\s+инструкции/gi,
];

export function sanitizeUserInputForPrompt(text: string): string {
  const withoutControl = text.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();

  let result = withoutControl;

  for (const pattern of SUSPICIOUS_PATTERNS) {
    result = result.replace(pattern, "[removed]");
  }

  return result.slice(0, 2000);
}
