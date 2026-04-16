export type CcsTask = {
  id: string;
  name: string;
};

export type CcsDependency = {
  from: string;
  to: string;
};

export type CcsBlueprint = {
  id: string;
  name: string;
  tasks: CcsTask[];
  dependencies: CcsDependency[];
};
