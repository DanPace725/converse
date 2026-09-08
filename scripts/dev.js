import http from "node:http";
import { readFile } from "node:fs/promises";
import chat from "../api/chat.js";
import models from "../api/models.js";
import session from "../api/session.js";
const routes = {
  "/api/chat": chat,
  "/api/models": models,
  "/api/session": session,
};
const types = {
  html: "text/html",
  js: "text/javascript",
  css: "text/css",
  png: "image/png",
  webmanifest: "application/manifest+json",
};
http
  .createServer(async (req, res) => {
    const path = new URL(req.url, "http://localhost").pathname;
    if (routes[path]) return routes[path](req, res);
    try {
      if (req.method !== "GET" || path.includes("..")) throw Error();
      const file = path === "/" ? "/index.html" : path;
      const data = await readFile(new URL("../public" + file, import.meta.url));
      res.writeHead(200, {
        "Content-Type":
          types[file.split(".").pop()] || "application/octet-stream",
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(Number(process.env.PORT || 3211), "127.0.0.1", () =>
    console.log("Converse: http://127.0.0.1:" + (process.env.PORT || 3211)),
  );
