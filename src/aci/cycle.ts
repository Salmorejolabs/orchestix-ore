import { AciBlueprint } from "./types";
import { reasonAboutBlueprint } from "./reasoning";
import { createContext } from "../ccs/context";
import { validateBlueprint } from "../ccs/validators";

export async function runAciCycle(
  blueprint: AciBlueprint,
  externalContext?: any
) {
  const context = externalContext || createContext();

  // 1. Validación constitucional (CCS)
  const validations = validateBlueprint(blueprint, context);

  const hasErrors = validations.some(v => !v.ok);

  if (hasErrors) {
    return {
      status: "rejected",
      order: [],
      blueprintId: blueprint.id,
      evidence: {
        constitutional: validations,
        reasoning: "Blueprint rechazado por violaciones constitucionales."
      }
    };
  }

  // 2. Razonamiento (ACI L3)
  const reasoning = reasonAboutBlueprint(blueprint);

  return {
    status: "approved",
    order: reasoning.order,
    blueprintId: blueprint.id,
    evidence: {
      constitutional: validations,
      reasoning: reasoning.reasoning
    }
  };
}
