import { models, redact } from "../lib/providers.js";
import { guard, json } from "../lib/access.js";
import { requestKeys } from "../lib/keys.js";
export default async function handler(req, res) {
  if (!guard(req, res)) return;
  if (req.method !== "GET") return json(res, 405, { error: "GET required" });
  let keys;
  try {
    keys = await requestKeys(req);
  } catch (e) {
    return json(res, 503, { error: redact(e) });
  }
  return json(
    res,
    200,
    Object.fromEntries(
      await Promise.all(
        ["GPT", "Claude", "Gemini"].map(async (p) => {
          try {
            return [p, { models: await models(p, keys) }];
          } catch (e) {
            return [p, { models: [], error: redact(e, keys) }];
          }
        }),
      ),
    ),
  );
}
