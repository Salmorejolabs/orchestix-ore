import type { CcsConstitution } from "./types";
import { constitutionalArticles } from "./articles";

export function loadConstitution(): CcsConstitution {
  return {
    version: "1.0",
    articles: constitutionalArticles
  };
}
