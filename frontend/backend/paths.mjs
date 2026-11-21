import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const FRONTEND_ROOT = fileURLToPath(new URL("../", import.meta.url));
export const REPOSITORY_ROOT = resolve(FRONTEND_ROOT, "..");
export const ANALYSIS_ROOT = resolve(REPOSITORY_ROOT, "argos-analise");
export const HISTORICAL_DB = resolve(ANALYSIS_ROOT, "dados", "argos.db");
export const OPERATIONAL_DB =
  process.env.ARGOS_DB || resolve(FRONTEND_ROOT, "runtime", "operacional.db");
