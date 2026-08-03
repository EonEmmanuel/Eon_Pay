import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

export async function startStaticServer(port: number): Promise<Server> {
  const distributionDirectory = path.resolve(process.cwd(), "dist");
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(
      new URL(request.url ?? "/", `http://${request.headers.host}`).pathname,
    );
    const requestedPath =
      pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    let filePath = path.resolve(distributionDirectory, requestedPath);

    if (!filePath.startsWith(`${distributionDirectory}${path.sep}`)) {
      response.writeHead(400).end("Invalid path");
      return;
    }

    try {
      const fileStat = await stat(filePath);
      if (fileStat.isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }
    } catch {
      filePath = path.join(distributionDirectory, "index.html");
    }

    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type":
        contentTypes[path.extname(filePath)] ?? "application/octet-stream",
    });
    createReadStream(filePath).pipe(response);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return server;
}

export async function stopStaticServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
}
