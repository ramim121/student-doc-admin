export function getSafeRedirectPath(
  candidate: string | null | undefined,
  fallback = '/',
) {
  if (!candidate) return fallback;

  const value = candidate.trim();
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return fallback;
  }

  return value;
}
