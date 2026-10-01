import { createContextHandler } from "../lib/conclave-http.js";
import {
  ContextRepository,
  downloadRecord,
} from "../lib/context-repository.js";
import { getDatabase } from "../lib/database.js";
import { ConclaveService } from "../lib/conclave/service.js";

// No sibling checkout, local data directory or provider credential enters the bundle.
const repository = () => new ContextRepository(getDatabase().db);
const read = (id, action) => repository().run(id, false, action);
const handler = createContextHandler({
  status: async () => {
    const status = ConclaveService.prototype.status.call({
      availability: () => ({
        openai: !!process.env.OPENAI_API_KEY,
        jev: !!(process.env.JEV_API_KEY || process.env.TYPESAFE_API_KEY),
      }),
    });
    return {
      ...status,
      available: !!process.env.DATABASE_URL,
      storage: "postgres",
    };
  },
  list: () => repository().list(),
  create: (title) => repository().create(title),
  view: (id) => read(id, (service) => service.view(id)),
  export: (id) => read(id, (service) => service.export(id)),
  download: (id) => read(id, (service) => downloadRecord(service, id)),
  activity: (id, options) =>
    read(id, (service) => service.activity(id, options)),
  ask: (id, input) =>
    repository().run(id, true, (service) => service.ask(id, input)),
  remember: (id, input) =>
    repository().run(id, true, (service) => service.remember(id, input)),
});
export default handler;
