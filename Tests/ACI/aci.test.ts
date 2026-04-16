import { describe, it, expect } from "vitest";
import { runAciCycle } from "../../src/aci/cycle";

describe("ACI v0.3", () => {
  it("Ciclo ACI completo: genera OrdenAprobada", () => {
    const mockBlueprint = {
      id: "bp_test_001",
      purpose: "Test blueprint",
      tasks: [
        { id: "t1", owner: "agentA", dependsOn: [] },
        { id: "t2", owner: "agentB", dependsOn: ["t1"] }
      ]
    };

    const result = runAciCycle(mockBlueprint);

    expect(result.status).toBe("approved");
    expect(result.order).toBe("OrdenAprobada");
    expect(result.evidence).toBeDefined();
    expect(result.evidence.constitutional).toBeDefined();
    expect(result.evidence.reasoning).toBeDefined();
  });
});
