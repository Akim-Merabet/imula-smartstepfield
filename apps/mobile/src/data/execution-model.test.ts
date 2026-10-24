import { describe, expect, it } from "vitest";

import { validationMessageKey } from "./execution-model";

describe("message de validation refusée (spec 05 §4.3)", () => {
  it("respecte l'ordre de priorité d'origine", () => {
    expect(validationMessageKey(["form", "multi_pr", "dsi"])).toBe("execution.requiredStatusesMsg");
    expect(validationMessageKey(["dsi", "form"])).toBe("execution.requiredSignatureAndFormMsg");
    expect(validationMessageKey(["form"])).toBe("execution.requiredFormMsg");
    expect(validationMessageKey(["dsi"])).toBe("execution.requiredSignatureMsg");
    expect(validationMessageKey([])).toBeNull();
  });
});
