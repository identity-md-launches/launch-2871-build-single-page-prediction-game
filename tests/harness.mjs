import { createServer } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { pathToFileURL } from "node:url";
export async function dependency(name, entry = "index.mjs") {
  return process.env.SQUEEK_DEPENDENCIES
    ? import(
        pathToFileURL(resolve(process.env.SQUEEK_DEPENDENCIES, name, entry))
          .href
      )
    : import(name);
}
export async function preview() {
  const root = resolve("dist");
  const mime = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".woff2": "font/woff2",
    ".txt": "text/plain",
  };
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      if (!pathname.startsWith("/preview/")) throw new Error("Not found");
      const file = resolve(
        root,
        pathname.slice("/preview/".length) || "index.html",
      );
      if (!file.startsWith(root + sep) || !(await stat(file)).isFile())
        throw new Error("Not found");
      res.writeHead(200, {
        "Content-Type": mime[extname(file)] || "application/octet-stream",
      });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  await mkdir("test/scratch/shots", { recursive: true });
  return {
    url: `http://127.0.0.1:${server.address().port}/preview/`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
export function fixtures(now = Date.now()) {
  return {
    now,
    rpm: 0,
    work: 42,
    round: 100,
    statusCalls: 0,
    historyCalls: 0,
    statusFailure: false,
    historyFailure: false,
    stale: false,
    telegramError: 0,
    telegramFailNetwork: false,
    telegramDelay: false,
    retrySeconds: 3,
    messages: [],
    chatMode: "single",
    chats: [{ id: 7734128, first_name: "Test recipient" }],
    updatesCalls: 0,
    urls: [],
  };
}
export async function mockFeed(page, state) {
  await page.route("https://api.squeekchain.com/v1/**", async (route) => {
    const status = route.request().url().includes("/status");
    if (status) state.statusCalls++;
    else state.historyCalls++;
    if (status ? state.statusFailure : state.historyFailure) {
      await route.fulfill({ status: 503, body: "Unavailable" });
      return;
    }
    const date = new Date(state.now - (state.stale ? 180000 : 0)).toISOString();
    const data = status
      ? {
          installationId: "browser-fixture",
          generatedAt: date,
          measurement: {
            freshness: "online",
            observedAt: date,
            staleAfterSeconds: 120,
            coreStatus: state.rpm ? "RUNNING" : "IDLE",
            rpmMilli: state.rpm * 1000,
          },
          builder: {
            status: "available",
            queued: { openRoundWorkUnits: String(state.work) },
          },
        }
      : {
          installationId: "browser-fixture",
          generatedAt: date,
          status: "available",
          recentSettlements: [state.round - 1, state.round].map((round) => ({
            previousSettledThroughRound: String(round - 1),
            settledThroughRound: String(round),
            workAdded: "42",
            confirmationStatus: "safe",
            blockTimestamp: date,
          })),
          mining: {
            nextRound: { round: String(state.round + 1) },
            recentCheckpoints: [
              {
                afterRound: String(state.round - 1),
                throughRound: String(state.round),
                blockTimestamp: date,
                confirmationStatus: "safe",
              },
            ],
          },
        };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  await page.route("https://api.telegram.org/**", async (route) => {
    const request = route.request();
    if (request.url().endsWith("/getUpdates")) {
      state.updatesCalls++;
      const result =
        state.chatMode === "empty"
          ? []
          : state.chats.map((chat) => ({ message: { chat } }));
      const conflict = state.chatMode === "conflict";
      await route.fulfill({
        status: conflict ? 409 : 200,
        contentType: "application/json",
        body: JSON.stringify(
          conflict ? { ok: false, error_code: 409 } : { ok: true, result },
        ),
      });
      return;
    }
    state.messages.push(
      Object.fromEntries(new URLSearchParams(request.postData())),
    );
    if (state.telegramFailNetwork) {
      await route.abort("failed");
      return;
    }
    if (state.telegramDelay) {
      state.telegramRelease = () =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        });
      return;
    }
    await route.fulfill({
      status: state.telegramError || 200,
      contentType: "application/json",
      body: JSON.stringify(
        state.telegramError
          ? {
              ok: false,
              error_code: state.telegramError,
              description: "UNTRUSTED RESPONSE",
              parameters: { retry_after: state.retrySeconds },
            }
          : { ok: true, result: { message_id: state.messages.length } },
      ),
    });
  });
  page.on("request", (request) => state.urls.push(request.url()));
}
