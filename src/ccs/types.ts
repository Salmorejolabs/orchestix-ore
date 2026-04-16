// Artículos constitucionales
export type CcsArticle = {
  id: string;
  title: string;
  description: string;
  appliesTo: string[]; // ["task", "dependency", "blueprint"]
};

// Constitución completa
export type CcsConstitution = {
  version: string;
  articles: CcsArticle[];
};

// Tareas del blueprint
export type CcsTask = {
  id: string;
  name: string;
  owner?: string;
  justification?: string;
  impact?: string;
};

// Dependencias entre tareas
export type CcsDependency = {
  from: string;
  to: string;
};

// Blueprint completo evaluado por CCS y ACI
export type CcsBlueprint = {
  id: string;
  name: string;
  tasks: CcsTask[];
  dependencies: CcsDependency[];
};
