import { createServer } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { pathToFileURL } from "node:url";

export async function dependency(name, entry = "", publicSpecifier = name) {
  return process.env.SQUEEK_DEPENDENCIES
    ? import(
        pathToFileURL(
          resolve(process.env.SQUEEK_DEPENDENCIES, name, entry || "index.mjs"),
        ).href
      )
    : import(publicSpecifier);
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
      if (!pathname.startsWith("/preview/")) {
        res.writeHead(404);
        res.end();
        return;
      }
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

// Synthetic API records are used only by tests, never bundled into the app.
export function fixtures(now = Date.now()) {
  const currentStart = Math.floor(now / 600_000) * 600_000;
  const installationId = "browser-test-only";
  return {
    status: {
      installationId,
      generatedAt: new Date(now).toISOString(),
      measurement: {
        freshness: "online",
        observedAt: new Date(now).toISOString(),
        staleAfterSeconds: 120,
        coreStatus: "IDLE",
        rpmMilli: 0,
        speedMmPerSecond: 0,
        cumulativeWorkUnits: "2400",
      },
      builder: {
        anchor: { settledThroughRound: "100" },
        queued: { openRoundWorkUnits: "0" },
      },
    },
    history: {
      status: "available",
      installationId,
      generatedAt: new Date(now).toISOString(),
      recentSettlements: [298, 0, 67, 530, 415, 8, 145].map((work, i) => ({
        settledThroughRound: String(100 - i),
        previousSettledThroughRound: String(99 - i),
        workAdded: String(work),
        confirmationStatus: "safe",
        blockTimestamp: new Date(currentStart - i * 600_000).toISOString(),
      })),
      mining: {
        nextRound: {
          round: "101",
          startsAt: new Date(currentStart).toISOString(),
          endsAt: new Date(currentStart + 600_000).toISOString(),
        },
      },
    },
    currentStart,
  };
}
export async function mockFeed(page, state) {
  await page.route("https://api.squeekchain.com/v1/**", async (route) => {
    if (
      state.failure ||
      (state.statusFailure && route.request().url().includes("/status"))
    ) {
      await route.fulfill({ status: 503, body: "Unavailable" });
      return;
    }
    const data = route.request().url().includes("/status")
      ? state.status
      : state.history;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
}
