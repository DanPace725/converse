import { ConclaveService } from "./service.js";
import { Store } from "./store.js";
import { environment } from "./provider.js";
import { createContextHandler } from "./http.js";
import { downloadRecord } from "./context-repository.js";

// Local SQLite fallback when DATABASE_URL is absent. Hosted requests use Neon.
export async function createConclaveHandler({ directory, service } = {}) {
  if (!service)
    for (const name of [
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "JEV_API_KEY",
      "TYPESAFE_API_KEY",
    ])
      environment(name);
  const store = service
    ? null
    : new Store(
        directory ||
          process.env.CONCLAVE_DATA_DIR ||
          ".conclave",
      );
  const core = service || new ConclaveService(store);
  core.download = (id) => downloadRecord(core, id);
  const handler = createContextHandler(core);
  handler.close = () => store?.close();
  return handler;
}
