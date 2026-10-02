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
        anthropic: !!process.env.ANTHROPIC_API_KEY,
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
  name: (id, input) => repository().run(id, true, (service) => service.name(id, input)),
  view: (id) => read(id, (service) => service.view(id)),
  workspaceFile: (id, path) =>
    read(id, (service) => service.workspaceFile(id, path)),
  sourceEvent: (id, eventId) =>
    read(id, (service) => service.sourceEvent(id, eventId)),
  contextBundle: (id, bundleId) =>
    read(id, (service) => service.contextBundle(id, bundleId)),
  saveDocument: (id, input) =>
    repository().run(id, true, (service) => service.saveDocument(id, input)),
  uploadDocument: (id, input) =>
    repository().run(id, true, (service) => service.uploadDocument(id, input)),
  saveContext: (id, input) =>
    repository().run(id, true, (service) => service.saveContext(id, input)),
  saveState: (id, input) =>
    repository().run(id, true, (service) => service.saveState(id, input)),
  export: (id) => read(id, (service) => service.export(id)),
  download: (id) => read(id, (service) => downloadRecord(service, id)),
  activity: (id, options) =>
    read(id, (service) => service.activity(id, options)),
  ask: (id, input, options) =>
    repository().run(id, true, (service) => service.ask(id, input, options)),
  remember: (id, input) =>
    repository().run(id, true, (service) => service.remember(id, input)),
  agentStart: (id, input) =>
    repository().run(id, true, (service) => service.agentStart(id, input)),
  agentStep: (id, input, options) =>
    repository().run(id, true, (service) => service.agentStep(id, input, options)),
  agentStop: (id, input) =>
    repository().run(id, true, (service) => service.agentStop(id, input)),
});
export default handler;
