import { identity } from "./access.js";
import { getDatabase } from "./database.js";
import { requestCredentials } from "./conclave/credentials.js";

// The provider keys this request may spend, by provider id. Undefined means
// the deployment's own environment keys (personal keys are off).
export const requestKeys = (req) =>
  requestCredentials(() => getDatabase().db, identity(req));
