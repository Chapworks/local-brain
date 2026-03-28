import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { userScope } from "./user-scope.ts";

Deno.test("userScope — null user returns IS NULL clause with no params", () => {
  const result = userScope(null, 1);
  assertEquals(result.clause, "user_id IS NULL");
  assertEquals(result.params, []);
});

Deno.test("userScope — null user ignores paramIdx", () => {
  const result = userScope(null, 5);
  assertEquals(result.clause, "user_id IS NULL");
  assertEquals(result.params, []);
});

Deno.test("userScope — user with id returns parameterized clause", () => {
  const result = userScope({ id: 42, name: "nick" }, 1);
  assertEquals(result.clause, "user_id = $1");
  assertEquals(result.params, [42]);
});

Deno.test("userScope — user with paramIdx 3", () => {
  const result = userScope({ id: 7, name: "test" }, 3);
  assertEquals(result.clause, "user_id = $3");
  assertEquals(result.params, [7]);
});

Deno.test("userScope — user id is included in params", () => {
  const result = userScope({ id: 100, name: "admin" }, 2);
  assertEquals(result.params.length, 1);
  assertEquals(result.params[0], 100);
});
