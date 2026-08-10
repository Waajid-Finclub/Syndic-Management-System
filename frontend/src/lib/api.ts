export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type ApiOptions = Omit<RequestInit, "body"> & {
  body?: BodyInit | object | null;
};

const INTERNAL_API_HOSTS = new Set(["127.0.0.1", "localhost", "backend"]);
const INTERNAL_API_PORT = "5000";

let csrfToken: string | null = null;

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const requestPath = normalizeApiPath(path);
  const isFormData = options.body instanceof FormData;
  const headers = new Headers(options.headers);
  const method = (options.method ?? "GET").toUpperCase();

  if (options.body && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (isUnsafeMethod(method) && !headers.has("X-CSRF-Token")) {
    headers.set("X-CSRF-Token", await getCsrfToken());
  }

  let { payload, response } = await sendRequest(requestPath, options, headers, method, isFormData);
  if (!response.ok && isUnsafeMethod(method) && isCsrfError(payload)) {
    csrfToken = null;
    headers.set("X-CSRF-Token", await getCsrfToken());
    ({ payload, response } = await sendRequest(requestPath, options, headers, method, isFormData));
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload && "error" in payload
        ? String(payload.error)
        : `Request failed with ${response.status}`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

export async function apiBlob(path: string, options: ApiOptions = {}): Promise<Blob> {
  const requestPath = normalizeApiPath(path);
  const isFormData = options.body instanceof FormData;
  const headers = new Headers(options.headers);
  const method = (options.method ?? "GET").toUpperCase();

  if (options.body && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (isUnsafeMethod(method) && !headers.has("X-CSRF-Token")) {
    headers.set("X-CSRF-Token", await getCsrfToken());
  }

  let response = await sendBlobRequest(requestPath, options, headers, method, isFormData);
  if (!response.ok && isUnsafeMethod(method)) {
    const retryPayload = await errorPayload(response);
    if (isCsrfError(retryPayload)) {
      csrfToken = null;
      headers.set("X-CSRF-Token", await getCsrfToken());
      response = await sendBlobRequest(requestPath, options, headers, method, isFormData);
    } else {
      throw errorFromPayload(retryPayload, response.status);
    }
  }

  if (!response.ok) {
    throw errorFromPayload(await errorPayload(response), response.status);
  }

  return response.blob();
}

async function sendRequest(
  path: string,
  options: ApiOptions,
  headers: Headers,
  method: string,
  isFormData: boolean,
) {
  const response = await fetch(path, {
    ...options,
    credentials: "include",
    method,
    headers,
    body:
      options.body && !isFormData && typeof options.body !== "string"
        ? JSON.stringify(options.body)
        : (options.body as BodyInit | null | undefined),
  });

  const contentType = response.headers.get("content-type") ?? "";
  const rawPayload = await response.text();
  let payload: unknown = rawPayload;
  if (contentType.includes("application/json") && rawPayload) {
    try {
      payload = JSON.parse(rawPayload);
    } catch {
      payload = rawPayload;
    }
  }
  return { payload, response };
}

async function sendBlobRequest(
  path: string,
  options: ApiOptions,
  headers: Headers,
  method: string,
  isFormData: boolean,
) {
  return fetch(path, {
    ...options,
    credentials: "include",
    method,
    headers,
    body:
      options.body && !isFormData && typeof options.body !== "string"
        ? JSON.stringify(options.body)
        : (options.body as BodyInit | null | undefined),
  });
}

async function errorPayload(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  const rawPayload = await response.text();
  if (contentType.includes("application/json") && rawPayload) {
    try {
      return JSON.parse(rawPayload) as unknown;
    } catch {
      return rawPayload;
    }
  }
  return rawPayload;
}

function errorFromPayload(payload: unknown, status: number) {
  const message =
    typeof payload === "object" && payload && "error" in payload
      ? String(payload.error)
      : `Request failed with ${status}`;
  return new ApiError(message, status);
}

/**
 * Fetch a file through the same-origin API proxy and save it to disk.
 * Used instead of a plain <a href> so credentials, CSRF and error handling
 * follow the same path as every other API call.
 */
export async function downloadFile(path: string, filename: string) {
  const blob = await apiBlob(path);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function getCsrfToken() {
  if (csrfToken) return csrfToken;
  const response = await fetch("/api/auth/csrf-token", {
    credentials: "include",
    method: "GET",
  });
  if (!response.ok) throw new ApiError("Could not initialize secure session", response.status);
  const payload = (await response.json()) as { csrf_token?: string };
  if (!payload.csrf_token) throw new ApiError("Could not initialize secure session", response.status);
  csrfToken = payload.csrf_token;
  return csrfToken;
}

function isUnsafeMethod(method: string) {
  return !["GET", "HEAD", "OPTIONS"].includes(method);
}

function isCsrfError(payload: unknown) {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    String(payload.error).toLowerCase().includes("csrf")
  );
}

function normalizeApiPath(path: string) {
  path = toSameOriginApiPath(path);

  if (!path.startsWith("/api/")) return path;

  const queryStart = path.indexOf("?");
  const pathname = queryStart === -1 ? path : path.slice(0, queryStart);
  const query = queryStart === -1 ? "" : path.slice(queryStart);

  if (pathname.length <= "/api".length + 1 || !pathname.endsWith("/")) {
    return path;
  }

  return `${pathname.slice(0, -1)}${query}`;
}

function toSameOriginApiPath(path: string) {
  try {
    const url = new URL(path);
    if (isInternalApiUrl(url)) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    return path;
  }

  return path;
}

function isInternalApiUrl(url: URL) {
  return (
    INTERNAL_API_HOSTS.has(url.hostname) &&
    url.port === INTERNAL_API_PORT &&
    url.pathname.startsWith("/api/")
  );
}
