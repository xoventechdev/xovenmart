/**
 * Unit tests for the word-locked "preserve admin input" rule.
 *
 * These cover the 12 cases listed in the design plan plus a few
 * edge cases (whitespace tolerance, fast-path identical strings,
 * slug fallback when name is non-ASCII only).
 */

import {
  applyNamePreservation,
  buildProductSlug,
  slugifyProductName,
} from "./name-preservation";

describe("applyNamePreservation", () => {
  describe("Bengali (bn) — WORD-LOCKED", () => {
    it("case 1: empty input → use LLM value (no correction, no rejection)", () => {
      const r = applyNamePreservation("", "আম", "bn");
      expect(r.value).toBe("আম");
      expect(r.corrected).toBe(false);
      expect(r.rejected).toBe(false);
    });

    it("case 2: small typo inside one word → correct", () => {
      const r = applyNamePreservation("অম", "আম", "bn");
      expect(r.value).toBe("আম");
      expect(r.corrected).toBe(true);
      expect(r.rejected).toBe(false);
      expect(r.reason).toBe("ok_small_fix");
    });

    it("case 3: identical multi-word input → no change", () => {
      const r = applyNamePreservation("পাকা আম", "পাকা আম", "bn");
      expect(r.value).toBe("পাকা আম");
      expect(r.corrected).toBe(false);
      expect(r.rejected).toBe(false);
      expect(r.reason).toBe("ok");
    });

    it("case 4: LLM removed a word → REJECT, keep admin", () => {
      const r = applyNamePreservation("পাকা আম", "আম", "bn");
      expect(r.value).toBe("পাকা আম");
      expect(r.corrected).toBe(false);
      expect(r.rejected).toBe(true);
      expect(r.reason).toBe("rejected_llm_word_count");
    });

    it("case 5: LLM added a word → REJECT, keep admin", () => {
      const r = applyNamePreservation("পাকা আম", "পাকা মিষ্টি আম", "bn");
      expect(r.value).toBe("পাকা আম");
      expect(r.corrected).toBe(false);
      expect(r.rejected).toBe(true);
      expect(r.reason).toBe("rejected_llm_word_count");
    });

    it("case 6: LLM reordered words → REJECT, keep admin", () => {
      const r = applyNamePreservation("পাকা আম", "আম পাকা", "bn");
      expect(r.value).toBe("পাকা আম");
      expect(r.corrected).toBe(false);
      expect(r.rejected).toBe(true);
      expect(r.reason).toBe("rejected_llm_word_order");
    });

    it("case 7: small fix inside one word of a multi-word name → accept", () => {
      const r = applyNamePreservation("পকা আম", "পাকা আম", "bn");
      expect(r.value).toBe("পাকা আম");
      expect(r.corrected).toBe(true);
      expect(r.rejected).toBe(false);
      expect(r.reason).toBe("ok_small_fix");
    });

    it("case 8: single-word identical → no change", () => {
      const r = applyNamePreservation("আম", "আম", "bn");
      expect(r.value).toBe("আম");
      expect(r.corrected).toBe(false);
      expect(r.rejected).toBe(false);
      expect(r.reason).toBe("ok");
    });

    it("extra: empty LLM → keep admin", () => {
      const r = applyNamePreservation("পাকা আম", "", "bn");
      expect(r.value).toBe("পাকা আম");
      expect(r.rejected).toBe(false);
    });

    it("extra: only one word allowed to differ — far rewrite rejected", () => {
      const r = applyNamePreservation("আম", "কলা", "bn");
      expect(r.value).toBe("আম");
      expect(r.rejected).toBe(true);
    });

    it("extra: trims whitespace before comparison", () => {
      const r = applyNamePreservation("  পাকা আম  ", "পাকা আম", "bn");
      expect(r.value).toBe("পাকা আম");
      expect(r.rejected).toBe(false);
    });
  });

  describe("English (en) — WORD-LOCKED", () => {
    it("case 9: empty input → use LLM value", () => {
      const r = applyNamePreservation("", "Mango", "en");
      expect(r.value).toBe("Mango");
      expect(r.corrected).toBe(false);
      expect(r.rejected).toBe(false);
    });

    it("case 10: identical multi-word → no change", () => {
      const r = applyNamePreservation("Ripe Mango", "Ripe Mango", "en");
      expect(r.value).toBe("Ripe Mango");
      expect(r.rejected).toBe(false);
    });

    it("case 11: LLM removed a word → REJECT, keep admin", () => {
      const r = applyNamePreservation("Ripe Mango", "Mango", "en");
      expect(r.value).toBe("Ripe Mango");
      expect(r.rejected).toBe(true);
      expect(r.reason).toBe("rejected_llm_word_count");
    });

    it("case 12: LLM added a word → REJECT, keep admin", () => {
      const r = applyNamePreservation("Ripe Mango", "Sweet Ripe Mango", "en");
      expect(r.value).toBe("Ripe Mango");
      expect(r.rejected).toBe(true);
      expect(r.reason).toBe("rejected_llm_word_count");
    });

    it("case 13: small typo inside one word → correct", () => {
      const r = applyNamePreservation("Mago", "Mango", "en");
      expect(r.value).toBe("Mango");
      expect(r.corrected).toBe(true);
      expect(r.rejected).toBe(false);
    });

    it("case 14: reorder rejected", () => {
      const r = applyNamePreservation("Ripe Mango", "Mango Ripe", "en");
      expect(r.value).toBe("Ripe Mango");
      expect(r.rejected).toBe(true);
      expect(r.reason).toBe("rejected_llm_word_order");
    });

    it("case 15: case-only difference inside a word still accepted as small fix", () => {
      const r = applyNamePreservation("mango", "Mango", "en");
      expect(r.value).toBe("Mango");
      expect(r.corrected).toBe(true);
      expect(r.rejected).toBe(false);
    });

    it("case 16: empty LLM value → keep admin", () => {
      const r = applyNamePreservation("Ripe Mango", "", "en");
      expect(r.value).toBe("Ripe Mango");
      expect(r.rejected).toBe(false);
    });
  });
});

describe("slugifyProductName", () => {
  it("lowercases ASCII and replaces separators with dashes", () => {
    expect(slugifyProductName("Ripe Mango")).toBe("ripe-mango");
  });

  it("strips punctuation", () => {
    expect(slugifyProductName("L'Oréal Cream!")).toBe("l-oreal-cream");
  });

  it("strips non-ASCII (Bengali) entirely", () => {
    expect(slugifyProductName("পাকা আম")).toBe("");
  });

  it("combines ASCII + Bengali by keeping only the ASCII part", () => {
    expect(slugifyProductName("Ripe Mango পাকা")).toBe("ripe-mango");
  });

  it("trims leading and trailing dashes", () => {
    expect(slugifyProductName("---hello---")).toBe("hello");
  });

  it("caps at 80 chars", () => {
    const long = "a".repeat(200);
    expect(slugifyProductName(long).length).toBe(80);
  });

  it("normalises combining marks (cafe -> cafe)", () => {
    // NFC combined: cafe\u0301 — strip combining acute
    expect(slugifyProductName("café")).toBe("cafe");
  });
});

describe("buildProductSlug", () => {
  it("returns the slugified ASCII name when possible", () => {
    expect(buildProductSlug("Ripe Mango", () => "abcdef")).toBe("ripe-mango");
  });

  it("falls back to product-{shortId} when name yields no ASCII", () => {
    expect(buildProductSlug("পাকা আম", () => "abcd1234")).toBe(
      "product-abcd1234",
    );
  });

  it("fallback factory is invoked only when needed", () => {
    const factory = jest.fn(() => "xyz12345");
    buildProductSlug("Ripe Mango", factory);
    expect(factory).not.toHaveBeenCalled();
  });

  it("fallback factory is invoked when name is empty", () => {
    const factory = jest.fn(() => "xyz12345");
    expect(buildProductSlug("", factory)).toBe("product-xyz12345");
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
