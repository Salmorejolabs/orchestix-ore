export type CcsPrecedent = {
  id: string;
  blueprintId: string;
  decision: "approved" | "rejected";
  reason: string;
  timestamp: number;
};

export class Jurisprudence {
  private precedents: CcsPrecedent[] = [];

  add(precedent: CcsPrecedent) {
    this.precedents.push(precedent);
  }

  findByBlueprint(blueprintId: string) {
    return this.precedents.filter(p => p.blueprintId === blueprintId);
  }

  getAll() {
    return this.precedents;
  }
}
