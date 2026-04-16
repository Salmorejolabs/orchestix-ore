import { createContext } from "../ccs/context";
import { validateBlueprint } from "../ccs/validators";
import { reasonAboutBlueprint } from "./reasoning";
import type { CcsBlueprint } from "../ccs/types";

const context = createContext();

export function runAciCycle(blueprint: CcsBlueprint) {
  // 1. Validación constitucional (CCS)
  const validations = validateBlueprint(blueprint, context);

  if (validations.some(v => !v.ok)) {
    return {
      status: "rejected",
      reasons: validations.filter(v => !v.ok),
      evidence: { constitutional: validations }
    };
  }

  // 2. Razonamiento (L3)
  const reasoning = reasonAboutBlueprint(blueprint);

  if (!reasoning.viable) {
    return {
      status: "rejected",
      reasons: reasoning.concerns,
      evidence: { constitutional: validations, reasoning }
    };
  }

  // 3. Decisión final
  return {
    status: "approved",
    order: "OrdenAprobada",
    evidence: {
      constitutional: validations,
      reasoning
    }
  };
}
