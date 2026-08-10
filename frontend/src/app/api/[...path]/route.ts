import { NextRequest } from "next/server";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const DEFAULT_BACKEND_BASE_URL = "http://127.0.0.1:5000";
const PLAIN_HTTP_BACKEND_HOSTS = new Set(["127.0.0.1", "localhost", "backend"]);
const REQUEST_ID_HEADER = "x-syndic-api-proxy-request-id";
const API_PROXY_DEBUG = isEnabled(process.env.API_PROXY_DEBUG);
const emittedWarnings = new Set<string>();

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function proxy(request: NextRequest, context: RouteContext) {
  const requestId = createRequestId();
  const { path } = await context.params;
  const backendBase = getBackendBaseUrl();
  const target = new URL(`/api/${path.map(encodeURIComponent).join("/")}`, backendBase);
  target.search = request.nextUrl.search;

  logProxy(requestId, "request", {
    method: request.method,
    publicPath: `${request.nextUrl.pathname}${request.nextUrl.search}`,
    target: sanitizeUrl(target),
    host: request.headers.get("host"),
    forwardedProto: request.headers.get("x-forwarded-proto"),
  });

  const headers = new Headers(request.headers);
  for (const header of HOP_BY_HOP_HEADERS) {
    headers.delete(header);
  }
  headers.delete("host");
  headers.set(REQUEST_ID_HEADER, requestId);

  const body = ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer();
  let backendResponse: Response;
  try {
    backendResponse = await fetch(target, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
    });
  } catch (error) {
    console.error(
      `[api-proxy:${requestId}] backend fetch failed ${JSON.stringify({
        method: request.method,
        publicPath: `${request.nextUrl.pathname}${request.nextUrl.search}`,
        target: sanitizeUrl(target),
        message: error instanceof Error ? error.message : String(error),
      })}`,
    );
    return Response.json(
      { error: "API proxy could not reach backend", request_id: requestId },
      {
        status: 502,
        headers: {
          "cache-control": "no-store",
          [REQUEST_ID_HEADER]: requestId,
        },
      },
    );
  }

  const responseHeaders = new Headers(backendResponse.headers);
  for (const header of HOP_BY_HOP_HEADERS) {
    responseHeaders.delete(header);
  }
  responseHeaders.set("cache-control", "no-store");
  responseHeaders.set(REQUEST_ID_HEADER, requestId);

  const location = responseHeaders.get("location");
  let publicLocation: string | null = null;
  if (location) {
    publicLocation = toPublicLocation(location, backendBase);
    responseHeaders.set("location", publicLocation);
  }

  logProxy(requestId, "response", {
    status: backendResponse.status,
    contentType: responseHeaders.get("content-type"),
    backendLocation: location,
    publicLocation,
  });

  const responseBody = shouldForwardBody(request.method, backendResponse.status)
    ? await backendResponse.arrayBuffer()
    : null;

  return new Response(responseBody, {
    status: backendResponse.status,
    statusText: backendResponse.statusText,
    headers: responseHeaders,
  });
}

function getBackendBaseUrl() {
  const rawBase = process.env.API_INTERNAL_URL ?? DEFAULT_BACKEND_BASE_URL;

  try {
    const url = new URL(rawBase);
    if (url.protocol === "https:" && url.port === "5000" && PLAIN_HTTP_BACKEND_HOSTS.has(url.hostname)) {
      warnOnce(
        "https-internal-backend",
        `API_INTERNAL_URL points to HTTPS on ${url.host}; using HTTP because the internal Flask backend listens without TLS.`,
      );
      url.protocol = "http:";
    }
    return url.toString();
  } catch {
    warnOnce(
      "invalid-api-internal-url",
      `API_INTERNAL_URL is invalid; falling back to ${DEFAULT_BACKEND_BASE_URL}.`,
    );
    return DEFAULT_BACKEND_BASE_URL;
  }
}

function toPublicLocation(location: string, backendBase: string) {
  try {
    const backend = new URL(backendBase);
    const next = new URL(location, backend);
    if (next.origin === backend.origin && next.pathname.startsWith("/api/")) {
      return `${next.pathname}${next.search}${next.hash}`;
    }
  } catch {
    return location;
  }

  return location;
}

function isEnabled(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

function createRequestId() {
  return Math.random().toString(36).slice(2, 10);
}

function sanitizeUrl(url: URL) {
  const safe = new URL(url);
  safe.username = "";
  safe.password = "";
  return safe.toString();
}

function shouldForwardBody(method: string, status: number) {
  return method !== "HEAD" && status !== 204 && status !== 304;
}

function logProxy(requestId: string, event: string, details: Record<string, unknown>) {
  if (!API_PROXY_DEBUG) return;
  console.info(`[api-proxy:${requestId}] ${event} ${JSON.stringify(details)}`);
}

function warnOnce(key: string, message: string) {
  if (emittedWarnings.has(key)) return;
  emittedWarnings.add(key);
  console.warn(`[api-proxy] ${message}`);
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
