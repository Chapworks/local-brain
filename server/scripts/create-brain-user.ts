/**
 * DEPRECATED: Use create-user.ts instead.
 *
 * This script has been replaced by the unified user management CLI.
 * Brain users and admin users are now a single account.
 */

console.error("This script is deprecated. Use create-user.ts instead.");
console.error("");
console.error("  create-user.ts <username> <password>              — create user");
console.error("  create-user.ts <username> <password> --superuser  — create as superuser");
console.error("  create-user.ts <username> --rotate                — rotate MCP key");
console.error("  create-user.ts <username> --promote               — promote secondary key");
console.error("  create-user.ts <username> --revoke-secondary      — remove secondary key");
console.error("  create-user.ts <username> --reset-password <pass> — reset password");
Deno.exit(1);
