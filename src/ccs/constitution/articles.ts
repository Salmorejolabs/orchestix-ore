import type { CcsArticle } from "./types";

export const constitutionalArticles: CcsArticle[] = [
  {
    id: "P1",
    title: "Propósito",
    description:
      "Toda acción, tarea o decisión debe alinearse explícitamente con el propósito declarado del blueprint. No se permiten tareas que no contribuyan al objetivo final.",
    appliesTo: ["blueprint", "task"]
  },
  {
    id: "P2",
    title: "Coherencia",
    description:
      "Las tareas deben ser coherentes entre sí. No pueden existir contradicciones lógicas, semánticas o operativas entre elementos del blueprint.",
    appliesTo: ["task", "dependency"]
  },
  {
    id: "P3",
    title: "No circularidad",
    description:
      "Las dependencias no pueden formar ciclos. Toda cadena de dependencias debe ser resoluble mediante orden topológico.",
    appliesTo: ["dependency"]
  },
  {
    id: "P4",
    title: "Legalidad",
    description:
      "El blueprint no puede contener tareas que violen restricciones explícitas del sistema, del entorno o de la constitución cognitiva.",
    appliesTo: ["task", "blueprint"]
  },
  {
    id: "P5",
    title: "Riesgo",
    description:
      "Toda acción debe minimizar riesgos innecesarios. Si una tarea introduce riesgo elevado sin justificación, debe ser rechazada.",
    appliesTo: ["task"]
  },
  {
    id: "P6",
    title: "Impacto",
    description:
      "Las tareas deben evaluar su impacto en el sistema y en el entorno. Impactos negativos no mitigados invalidan el blueprint.",
    appliesTo: ["task", "blueprint"]
  },
  {
    id: "P7",
    title: "Transparencia",
    description:
      "Toda decisión debe ser explicable. Si una tarea o dependencia no puede justificarse, debe ser rechazada.",
    appliesTo: ["task", "dependency", "blueprint"]
  },
  {
    id: "P8",
    title: "Responsabilidad",
    description:
      "El sistema debe poder atribuir responsabilidad a cada tarea. Si una tarea carece de responsable o trazabilidad, no puede aprobarse.",
    appliesTo: ["task"]
  }
];
