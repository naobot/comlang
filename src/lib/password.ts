/**
 * What makes a new password acceptable, in one place.
 *
 * Pure — no `vue`, no `pinia`, no Supabase client — because it is checked in two views
 * (sign up, set password) and asserted in `password.test.ts`. The server has the final
 * say: GoTrue enforces its own minimum, and its answer is what the store reports. This
 * exists so the common mistakes are caught in the form rather than in a round trip.
 *
 * Length and nothing else, deliberately. Character-class rules push people towards
 * `Passw0rd!` and are no longer what NIST or anyone else recommends; a longer minimum
 * does more.
 */
export const MIN_PASSWORD_LENGTH = 8;

/** A message to show, or null when the pair is fine. */
export function passwordProblem(password: string, confirmation: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  // Checked after the length, so someone typing a short password twice is told the
  // useful thing rather than that their two identical entries do not match.
  if (password !== confirmation) return "The two passwords don't match.";
  return null;
}
