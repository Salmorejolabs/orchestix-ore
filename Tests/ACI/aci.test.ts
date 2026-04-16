import { expect } from "chai";
import { runAciCycle } from "../../src/aci/cycle";

describe("ACI v0.3", () => {
  it("Ciclo ACI completo: genera OrdenAprobada", async () => {
    const mockBlueprint = {
      id: "bp_test_001",
      purpose: "Test blueprint",
      tasks: [
        {
          id: "t1",
          name: "Primera tarea",
          owner: "agentA",
          dependsOn: [],
          impact: ["low"],
          justification: "test ok"
        },
        {
          id: "t2",
          name: "Segunda tarea",
          owner: "agentB",
          dependsOn: ["t1"],
          impact: ["low"],
          justification: "test ok"
        }
      ]
    };

    const mockContext = {
      agents: ["agentA", "agentB"],
      environment: "test"
    };

    const orden = await runAciCycle(mockBlueprint, mockContext);

    expect(orden.status).to.equal("approved");
    expect(orden.blueprintId).to.equal("bp_test_001");
  });
});

