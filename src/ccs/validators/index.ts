import type { CcsBlueprint } from "../types";
import type { CcsContext } from "../context";

export type ValidationResult = {
  ok: boolean;
  article: string;
  message: string;
};

// --- P1: Propósito ---
function validatePurpose(blueprint: CcsBlueprint): ValidationResult {
  const rawPurpose = blueprint.name ?? blueprint.purpose ?? "";
  const purpose = rawPurpose.toString().trim();
  const ok = purpose.length >= 3;

  return {
    ok,
    article: "P1",
    message: ok
      ? "El blueprint tiene un propósito claro."
      : "El blueprint carece de un propósito claro o su nombre es insuficiente."
  };
}

// --- P2: Coherencia ---
function validateCoherence(blueprint: CcsBlueprint): ValidationResult {
  const taskNames = blueprint.tasks.map(t => (t.name ?? "").toLowerCase());
  const hasDuplicates = new Set(taskNames).size !== taskNames.length;

  return {
    ok: !hasDuplicates,
    article: "P2",
    message: hasDuplicates
      ? "Existen tareas duplicadas o incoherentes."
      : "Las tareas son coherentes entre sí."
  };
}

// --- P3: No circularidad ---
function validateNoCycles(blueprint: CcsBlueprint): ValidationResult {
  // Aceptamos dependencias en blueprint.dependencies o en t.dependsOn
  const deps =
    blueprint.dependencies ??
    blueprint.tasks.flatMap(t =>
      (t.dependsOn ?? []).map(d => ({ from: d, to: t.id }))
    );

  const indegree: Record<string, number> = {};
  blueprint.tasks.forEach(t => (indegree[t.id] = 0));

  deps.forEach(dep => {
    indegree[dep.to] = (indegree[dep.to] ?? 0) + 1;
  });

  const queue = Object.keys(indegree).filter(k => indegree[k] === 0);
  let visited = 0;

  while (queue.length > 0) {
    const node = queue.shift()!;
    visited++;

    deps
      .filter(dep => dep.from === node)
      .forEach(dep => {
        indegree[dep.to]--;
        if (indegree[dep.to] === 0) queue.push(dep.to);
      });
  }

  const ok = visited === blueprint.tasks.length;

  return {
    ok,
    article: "P3",
    message: ok
      ? "No se detectaron ciclos en las dependencias."
      : "Se detectó un ciclo en las dependencias del blueprint."
  };
}

// --- P4: Legalidad ---
function validateLegality(blueprint: CcsBlueprint): ValidationResult {
  const illegal = blueprint.tasks.some(t =>
    ["hack", "bypass", "override"].some(bad =>
      (t.name ?? "").toLowerCase().includes(bad)
    )
  );

  return {
    ok: !illegal,
    article: "P4",
    message: illegal
      ? "El blueprint contiene tareas que violan restricciones explícitas."
      : "No se detectaron violaciones legales."
  };
}

// --- P5: Riesgo ---
function validateRisk(blueprint: CcsBlueprint): ValidationResult {
  const risky = blueprint.tasks.some(t =>
    ["delete", "remove", "shutdown"].some(bad =>
      (t.name ?? "").toLowerCase().includes(bad)
    )
  );

  return {
    ok: !risky,
    article: "P5",
    message: risky
      ? "Se detectaron tareas con riesgo elevado no justificado."
      : "No se detectaron riesgos elevados."
  };
}

// --- P6: Impacto ---
function validateImpact(blueprint: CcsBlueprint): ValidationResult {
  const impactMissing = blueprint.tasks.some(
    t => !t.impact || t.impact.length === 0
  );

  return {
    ok: !impactMissing,
    article: "P6",
    message: impactMissing
      ? "Falta información de impacto en una o más tareas."
      : "Todas las tareas incluyen evaluación de impacto."
  };
}

// --- P7: Transparencia ---
function validateTransparency(blueprint: CcsBlueprint): ValidationResult {
  const missingJustification = blueprint.tasks.some(t => !t.justification);

  return {
    ok: !missingJustification,
    article: "P7",
    message: missingJustification
      ? "Una o más tareas carecen de justificación explícita."
      : "Todas las tareas son transparentes y justificadas."
  };
}

// --- P8: Responsabilidad ---
function validateResponsibility(blueprint: CcsBlueprint): ValidationResult {
  const missingOwner = blueprint.tasks.some(t => !t.owner);

  return {
    ok: !missingOwner,
    article: "P8",
    message: missingOwner
      ? "Una o más tareas carecen de responsable asignado."
      : "Todas las tareas tienen responsable asignado."
  };
}

// --- Export principal ---
export function validateBlueprint(
  blueprint: CcsBlueprint,
  context: CcsContext
): ValidationResult[] {
  return [
    validatePurpose(blueprint),
    validateCoherence(blueprint),
    validateNoCycles(blueprint),
    validateLegality(blueprint),
    validateRisk(blueprint),
    validateImpact(blueprint),
    validateTransparency(blueprint),
    validateResponsibility(blueprint)
  ];
}

