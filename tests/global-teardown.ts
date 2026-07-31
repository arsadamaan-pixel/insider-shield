import { existsSync, rmSync } from "node:fs";
import { E2E_DB_PATH } from "./env";

// Leaves no trace on disk between runs — mirrors global-setup's own
// wipe-before-run, just bookending it with a wipe-after-run too.
export default function globalTeardown() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${E2E_DB_PATH}${suffix}`;
    if (existsSync(file)) rmSync(file);
  }
}
