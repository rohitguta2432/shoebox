import { describe, expect, it } from "vitest";
import { checkCharFor, hasValidChecksum, stateCodeFromPlace, suggestFixes, verifyGstin } from "./gstin";

// GSTINs with correct check characters (public sample + well-known formats).
const VALID = ["27AAPFU0939F1ZV", "07AAGFF2194N1Z1", "24AAACC1206D1ZM", "27AAACR5055K1Z7"];
const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

describe("GSTIN checksum", () => {
  it("accepts GSTINs whose check character is right", () => {
    for (const g of VALID) expect(verifyGstin(g).status).toBe("valid");
  });

  it("catches every possible single-character misread", () => {
    let tried = 0;
    for (const g of VALID) {
      for (let i = 0; i < 15; i++) {
        for (const c of CHARS) {
          if (c === g[i]) continue;
          expect(hasValidChecksum(g.slice(0, i) + c + g.slice(i + 1))).toBe(false);
          tried++;
        }
      }
    }
    expect(tried).toBe(4 * 15 * 35);
  });

  it("fixes an O read in place of a 0", () => {
    const v = verifyGstin("27AAPFUO939F1ZV");
    expect(v.status).toBe("bad-shape");
    expect(v.status === "bad-shape" && v.fixes).toEqual([
      { gstin: "27AAPFU0939F1ZV", position: 8, from: "O", to: "0" },
    ]);
  });

  it("lists every candidate when a misread is ambiguous", () => {
    const fixes = suggestFixes("27AAPEU0939F1ZV").map((f) => f.gstin);
    expect(fixes).toContain("27AAPFU0939F1ZV");
  });

  it("reports the expected check character", () => {
    const v = verifyGstin("27AAPFU0939F1ZW");
    expect(v.status).toBe("bad-checksum");
    expect(v.status === "bad-checksum" && v.expected).toBe("V");
  });

  it("rejects unknown state codes and wrong lengths", () => {
    const unknown = "00AAPFU0939F1Z";
    expect(verifyGstin(unknown + checkCharFor(unknown)).status).toBe("unknown-state");
    expect(verifyGstin("27AAPFU0939F1Z").status).toBe("bad-shape");
    expect(verifyGstin("").status).toBe("missing");
    expect(verifyGstin(" 27aapfu0939f1zv ").status).toBe("valid");
  });
});

describe("place of supply", () => {
  it("reads codes and state names", () => {
    expect(stateCodeFromPlace("27-Maharashtra")).toBe("27");
    expect(stateCodeFromPlace("Karnataka (29)")).toBe("29");
    expect(stateCodeFromPlace("New Delhi")).toBe("07");
    expect(stateCodeFromPlace("Andhra Pradesh")).toBe("37");
    expect(stateCodeFromPlace("Dadra and Nagar Haveli and Daman and Diu")).toBe("26");
    expect(stateCodeFromPlace("somewhere")).toBeNull();
  });
});
