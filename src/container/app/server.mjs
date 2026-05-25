import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import pino from "pino";

const logger = pino({
  formatters: { level: (label) => ({ level: label }) },
  timestamp: pino.stdTimeFunctions.isoTime,
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexHtml = fs.readFileSync(
  path.join(__dirname, "index.html"),
  "utf-8"
);

const port = Number(process.env.PORT) || 8080;
const WS_PATH = "/websocket";

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(indexHtml);
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found" }));
});

const wss = new WebSocketServer({ noServer: true });
const clients = new Map();

server.on("upgrade", (req, socket, head) => {
  if (req.url !== WS_PATH) {
    logger.warn({ url: req.url }, "ws upgrade rejected: invalid path");
    socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws, req) => {
  const id = randomUUID();
  clients.set(ws, { id, connectedAt: new Date().toISOString() });
  logger.info(
    {
      id,
      url: req.url,
      userAgent: req.headers["user-agent"],
      forwardedFor: req.headers["x-forwarded-for"],
      cloudfrontId: req.headers["x-amz-cf-id"],
      clientCount: clients.size,
    },
    "ws connected"
  );

  ws.send(
    JSON.stringify({
      type: "welcome",
      id,
      clientCount: clients.size,
    })
  );

  ws.on("message", (data, isBinary) => {
    const text = isBinary ? "<binary>" : data.toString();
    logger.info({ id, bytes: data.length, isBinary }, "ws message received");

    ws.send(JSON.stringify({ type: "echo", from: id, message: text }));

    let broadcastCount = 0;
    for (const [peer, meta] of clients) {
      if (peer !== ws && peer.readyState === WebSocket.OPEN) {
        peer.send(
          JSON.stringify({ type: "broadcast", from: id, message: text })
        );
        broadcastCount += 1;
      }
    }
    if (broadcastCount > 0) {
      logger.info({ id, broadcastCount }, "ws message broadcasted");
    }
  });

  ws.on("close", (code, reason) => {
    clients.delete(ws);
    logger.info(
      { id, code, reason: reason.toString(), clientCount: clients.size },
      "ws closed"
    );
  });

  ws.on("error", (err) => {
    logger.error({ id, err: err.message }, "ws error");
  });
});

server.keepAliveTimeout = 90_000;
server.headersTimeout = 100_000;

server.listen(port, "0.0.0.0", () => {
  logger.info(
    {
      port,
      wsPath: WS_PATH,
      keepAliveTimeoutMs: server.keepAliveTimeout,
      headersTimeoutMs: server.headersTimeout,
    },
    "WebSocket server listening"
  );
});

const shutdown = (signal) => {
  logger.info({ signal }, "shutting down");
  for (const ws of clients.keys()) {
    try {
      ws.close(1001, "server shutdown");
    } catch (err) {
      logger.warn({ err: err.message }, "failed to close client");
    }
  }
  wss.close(() => {
    server.close(() => {
      logger.info("shutdown complete");
      process.exit(0);
    });
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
