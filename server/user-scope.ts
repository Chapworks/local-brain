/**
 * User scoping helpers — shared between MCP server and admin panel.
 */

export interface ResolvedUser {
  id: number;
  name: string;
  username: string;
  isSuperuser: boolean;
  needsPasswordSetup: boolean;
}

/** Build a WHERE clause fragment for user scoping. */
export function userScope(
  user: ResolvedUser | null,
  paramIdx: number
): { clause: string; params: unknown[] } {
  if (user) {
    return { clause: `user_id = $${paramIdx}`, params: [user.id] };
  }
  return { clause: "user_id IS NULL", params: [] };
}
