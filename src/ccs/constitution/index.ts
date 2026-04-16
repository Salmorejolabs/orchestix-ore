export type CcsArticle = {
  id: string;
  title: string;
  description: string;
  appliesTo: string[]; // ["task", "dependency", "blueprint"]
};

export type CcsConstitution = {
  version: string;
  articles: CcsArticle[];
};

export function loadConstitution(): CcsConstitution {
  return {
    version: "1.0",
    articles: [
      {
        id: "P1",
        title: "Propósito",
        description: "Toda acción debe alinearse con el propósito declarado del blueprint.",
        appliesTo: ["blueprint"]
      },
      {
        id: "P2",
        title: "Coherencia",
        description: "Las tareas deben ser coherentes entre sí y no contradictorias.",
        appliesTo: ["task", "dependency"]
      },
      {
        id: "P3",
        title: "No circularidad",
        description: "Las dependencias no pueden formar ciclos.",
        appliesTo: ["dependency"]
      }
    ]
  };
}
