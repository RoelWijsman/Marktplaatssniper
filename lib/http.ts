import http from "node:http";
import https from "node:https";
import type net from "node:net";
import zlib from "node:zlib";

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

export interface HttpResult {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
  wireBytes: number | null; // bytes over de verbinding met de proxy (wat een proxyleverancier rekent)
  sessionReused: boolean;
}

export interface HttpOptions {
  agent?: http.Agent;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  session?: Buffer; // eerder ontvangen TLS-sessie: maakt de handshake veel kleiner
  onSession?: (session: Buffer) => void;
}

const directAgent = new https.Agent({ keepAlive: true });

type TlsLike = net.Socket & { _parent?: net.Socket | null; isSessionReused?: () => boolean };

/** Eenvoudige GET met een eigen agent (proxy) en een harde time-out. */
export function httpGet(url: string, options: HttpOptions = {}): Promise<HttpResult> {
  const { timeoutMs = 15_000, maxBytes = 10_000_000 } = options;
  const target = new URL(url);
  const client = target.protocol === "http:" ? http : https;

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error: Error | null, result?: HttpResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result as HttpResult);
    };

    // Weigert een HTTP-proxy de verbinding (bijv. 407), dan geeft https-proxy-agent het antwoord van de
    // proxy door alsof het van de website komt. Dat vangen we hier af als proxyfout.
    let proxyStatus: number | null = null;

    const req = client.get(
      target,
      {
        agent: options.agent ?? (client === https ? directAgent : undefined),
        headers: options.headers,
        ...(options.session && client === https ? { session: options.session } : {}),
      },
      (res) => {
        if (proxyStatus !== null) {
          res.resume();
          finish(Object.assign(new Error(`proxy weigert de verbinding (HTTP ${proxyStatus})`), { code: `EPROXY${proxyStatus}` }));
          req.destroy();
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            req.destroy(new Error("antwoord is te groot"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          try {
            const socket = res.socket as TlsLike;
            const raw = options.agent ? socket._parent : null; // de ruwe verbinding met de proxy
            const wireBytes = raw ? raw.bytesRead + raw.bytesWritten : null;
            const sessionReused = socket.isSessionReused?.() ?? false;
            if (options.agent) {
              // Tunnels via een proxy worden niet hergebruikt: meteen sluiten in plaats van open laten hangen.
              socket.destroy();
              raw?.destroy();
            }
            const body = decode(Buffer.concat(chunks), res.headers["content-encoding"]);
            finish(null, { status: res.statusCode ?? 0, headers: res.headers, body, wireBytes, sessionReused });
          } catch (error) {
            finish(error as Error);
          }
        });
        res.on("error", (error) => finish(error));
      },
    );
    const timer = setTimeout(
      () => req.destroy(Object.assign(new Error("time-out"), { code: "ETIMEDOUT" })),
      timeoutMs,
    );
    if (options.onSession) {
      const onSession = options.onSession;
      req.on("socket", (socket) => socket.on("session", onSession));
    }
    req.on("proxyConnect", (connect: { statusCode?: number }) => {
      if (connect.statusCode !== 200) proxyStatus = connect.statusCode ?? 0;
    });
    req.on("error", (error) => finish(error));
  });
}

function decode(body: Buffer, encoding: string | undefined): Buffer {
  switch ((encoding ?? "").trim().toLowerCase()) {
    case "gzip":
      return zlib.gunzipSync(body);
    case "deflate":
      return zlib.inflateSync(body);
    case "br":
      return zlib.brotliDecompressSync(body);
    default:
      return body;
  }
}
