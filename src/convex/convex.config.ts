/**
 * Convex app definition (required by the Convex CLI v1.4x+).
 *
 * The location of this file defines the functions root (`src/convex/`). Without
 * it, the CLI falls back to an empty default functions directory, pushes zero
 * functions, and wipes the deployment — causing client errors like
 * "Could not find public function for 'users:currentUser'".
 *
 * NOTE: This project uses classic (non-component) Convex Auth
 * (`@convex-dev/auth` v0.0.x via `convexAuth` in `./auth.ts` and
 * `auth.addHttpRoutes()` in `./http.ts`), so no auth component is mounted here.
 */
import { defineApp } from "convex/server";

const app = defineApp();

export default app;
