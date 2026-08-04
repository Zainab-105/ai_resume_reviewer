import assert from "node:assert/strict";
import test from "node:test";

import { one } from "../relations.ts";

test("unwraps a to-one relation returned as an object", () => {
  assert.deepEqual(one<{ file_name: string }>({ file_name: "resume.pdf" }), {
    file_name: "resume.pdf",
  });
});

test("unwraps a relation returned as an array", () => {
  assert.deepEqual(one<{ file_name: string }>([{ file_name: "resume.pdf" }]), {
    file_name: "resume.pdf",
  });
});

test("null and undefined pass through as null", () => {
  assert.equal(one(null), null);
  assert.equal(one(undefined), null);
});

test("an empty array is null rather than undefined", () => {
  assert.equal(one([]), null);
});

test("the first row wins when several are returned", () => {
  assert.deepEqual(one<{ id: number }>([{ id: 1 }, { id: 2 }]), { id: 1 });
});

test("a nested field is readable from both shapes", () => {
  // The bug this guards against: `?.[0]?.version` against an object yields
  // undefined, and a `?? fallback` then hides it entirely.
  const asObject = one<{ version: number }>({ version: 2 })?.version;
  const asArray = one<{ version: number }>([{ version: 2 }])?.version;

  assert.equal(asObject, 2);
  assert.equal(asArray, 2);
});
