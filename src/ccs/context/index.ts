import { loadConstitution } from "../constitution";
import { Jurisprudence } from "../jurisprudence";

export type CcsContext = {
  constitution: ReturnType<typeof loadConstitution>;
  jurisprudence: Jurisprudence;
};

export function createContext(): CcsContext {
  return {
    constitution: loadConstitution(),
    jurisprudence: new Jurisprudence()
  };
}

