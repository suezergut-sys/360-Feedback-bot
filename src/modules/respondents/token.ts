const TOKEN_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeInviteToken(token: string | null | undefined): string | null {
  if (!token) {
    return null;
  }

  const normalized = token.trim();

  if (!normalized) {
    return null;
  }

  return normalized;
}

export function isInviteTokenFormatValid(token: string | null | undefined): boolean {
  const normalized = normalizeInviteToken(token);

  if (!normalized) {
    return false;
  }

  return TOKEN_REGEX.test(normalized);
}
