/**
 * JWT configuration.
 *
 * The secret is read once and validated. A development fallback keeps local
 * setup working, but in production a missing secret is fatal: an unset secret
 * silently signing every token with `dev-secret` is the kind of thing that is
 * discovered by an attacker rather than by a test.
 */
export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!secret) {
    if (isProduction) {
      throw new Error(
        'JWT_SECRET is not set. Refusing to start in production with a default signing key.',
      );
    }
    return 'dev-secret';
  }

  if (isProduction && secret.length < 32) {
    throw new Error(
      `JWT_SECRET is only ${secret.length} characters. Use at least 32 random characters in production.`,
    );
  }

  return secret;
}
