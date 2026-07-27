import assert from "node:assert/strict";
import test from "node:test";

// Explicit .ts extensions: Node's ESM resolver does not guess extensions, and
// TypeScript accepts them under `allowImportingTsExtensions`.
import { scoreAts } from "../ats.ts";
import { countWords, looksLikePdf } from "../extract.ts";
import { detectRedFlags } from "../red-flags.ts";
import { fixtures } from "./fixtures.ts";

test("PDF magic bytes are checked, not the client-supplied MIME type", () => {
  assert.equal(looksLikePdf(new TextEncoder().encode("%PDF-1.4\nrest")), true);
  assert.equal(looksLikePdf(new TextEncoder().encode("hello not a pdf")), false);
  assert.equal(looksLikePdf(new Uint8Array([0x25, 0x50])), false, "must not overrun a short buffer");
});

test("word count ignores punctuation and bullet glyphs", () => {
  assert.equal(countWords("- Led 6 engineers, cut deploy time 40%"), 7);
  assert.equal(countWords(""), 0);
});

for (const fixture of fixtures) {
  test(`ATS score: ${fixture.name}`, () => {
    const { score, checks } = scoreAts({
      text: fixture.text,
      pageCount: fixture.pageCount,
      fileName: fixture.fileName,
    });

    const [min, max] = fixture.expectAts;
    assert.ok(
      score >= min && score <= max,
      `expected ATS ${min}-${max}, got ${score}\n` +
        checks.map((c) => `  ${c.label}: ${Math.round(c.ratio * c.weight)}/${c.weight}`).join("\n"),
    );

    assert.equal(checks.length, 8, "rubric must always report all eight checks");
    for (const check of checks) {
      assert.ok(check.ratio >= 0 && check.ratio <= 1, `${check.id} ratio out of range`);
      assert.ok(check.detail.length > 0, `${check.id} must explain itself`);
    }
  });

  test(`red flags: ${fixture.name}`, () => {
    const ids = new Set(detectRedFlags(fixture.text, fixture.fileName).map((f) => f.id));

    for (const expected of fixture.expectFlags) {
      assert.ok(ids.has(expected), `expected flag "${expected}", got [${[...ids].join(", ")}]`);
    }
    for (const forbidden of fixture.forbidFlags) {
      assert.ok(!ids.has(forbidden), `did not expect flag "${forbidden}"`);
    }
  });
}

test("score is bounded even for empty input", () => {
  const { score } = scoreAts({ text: "", pageCount: 0, fileName: "x.pdf" });
  assert.ok(score >= 0 && score <= 100, `got ${score}`);
});

test("multi-column layout is penalised", () => {
  const columnar = Array.from(
    { length: 6 },
    () => "Skills      Python      Docker      AWS",
  ).join("\n");

  const { checks } = scoreAts({ text: columnar, pageCount: 1, fileName: "a.pdf" });
  const layout = checks.find((c) => c.id === "single-column");
  assert.equal(layout?.passed, false, "table-like content should fail the layout check");
});
