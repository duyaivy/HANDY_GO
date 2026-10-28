
type CustomOptions = Omit<RequestInit, "method" | "body"> & {
  baseUrl?: string;
  body?: unknown;
};

const ENTITY_ERROR_STATUS = 422;

type ErrorPayload = {
  message?: string;
  [key: string]: unknown;
};

let refreshPromise: Promise<Response> | null = null;
let cachedRefreshResponse: Response | null = null;
let cachedRefreshExpiresAt = 0;

const REFRESH_LOCK_NAME = "handygo-auth-refresh";
const REFRESH_CHANNEL_NAME = "handygo-auth-session";
const REFRESH_VERSION_KEY = "handygo-auth-refresh-version";
const REFRESH_LOCK_PREFIX = "handygo-auth-refresh-lock:";

type RefreshBroadcast = { type: "refresh-completed"; version: string };
type RefreshOptions = {
  force?: boolean;
  skipIfRefreshed?: boolean;
  versionAtRequestStart?: string | null;
};

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function getRefreshVersion() {
  try {
    return window.localStorage.getItem(REFRESH_VERSION_KEY);
  } catch {
    return null;
  }
}

function createLockOwner() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function announceAuthUpdated(channel?: BroadcastChannel | null) {
  const version = createLockOwner();
  try {
    window.localStorage.setItem(REFRESH_VERSION_KEY, version);
  } catch (error) {
    console.error("Không thể lưu phiên bản refresh", error);
  }
  try {
    channel?.postMessage({
      type: "refresh-completed",
      version,
    } satisfies RefreshBroadcast);
  } catch (error) {
    console.error("Không thể thông báo refresh cho các tab khác", error);
  }
}

type BakeryTicket = {
  id: string;
  ticket: number;
  choosing: boolean;
  expiresAt: number;
};

function readTickets(storage: Storage): BakeryTicket[] {
  const now = Date.now();
  const tickets: BakeryTicket[] = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(REFRESH_LOCK_PREFIX)) continue;

    try {
      const value: unknown = JSON.parse(storage.getItem(key) ?? "");
      if (typeof value !== "object" || value === null) continue;

      const record = value as Partial<BakeryTicket>;
      if (
        typeof record.id !== "string" ||
        typeof record.ticket !== "number" ||
        typeof record.expiresAt !== "number"
      ) {
        continue;
      }

      if (record.expiresAt <= now) {
        storage.removeItem(key);
        index -= 1;
        continue;
      }

      tickets.push({
        id: record.id,
        ticket: record.ticket,
        choosing: record.choosing === true,
        expiresAt: record.expiresAt,
      });
    } catch {
      storage.removeItem(key);
      index -= 1;
    }
  }

  return tickets;
}

function precedes(left: BakeryTicket, right: BakeryTicket) {
  return (
    left.ticket < right.ticket ||
    (left.ticket === right.ticket && left.id < right.id)
  );
}

async function withStorageLock<Result>(operation: () => Promise<Result>) {
  const id = createLockOwner();
  const key = `${REFRESH_LOCK_PREFIX}${id}`;
  const storage = window.localStorage;
  let current: BakeryTicket = {
    id,
    ticket: 0,
    choosing: true,
    expiresAt: Date.now() + 120_000,
  };
  const writeTicket = () => storage.setItem(key, JSON.stringify(current));

  writeTicket();
  const choosingHeartbeat = window.setInterval(() => {
    current.expiresAt = Date.now() + 120_000;
    writeTicket();
  }, 20_000);

  try {
    const highestTicket = readTickets(storage).reduce(
      (highest, ticket) => Math.max(highest, ticket.ticket),
      0,
    );
    current = {
      ...current,
      ticket: highestTicket + 1,
      choosing: false,
      expiresAt: Date.now() + 120_000,
    };
    writeTicket();

    while (true) {
      const tickets = readTickets(storage);
      if (!tickets.some((ticket) => ticket.id === id)) {
        const highestTicket = tickets.reduce(
          (highest, ticket) => Math.max(highest, ticket.ticket),
          0,
        );
        current = {
          ...current,
          ticket: highestTicket + 1,
          choosing: false,
          expiresAt: Date.now() + 120_000,
        };
        writeTicket();
        await wait(50);
        continue;
      }

      if (
        !tickets.some(
          (ticket) => ticket.id !== id && precedes(ticket, current),
        )
      ) {
        break;
      }
      current.expiresAt = Date.now() + 120_000;
      writeTicket();
      await wait(50);
    }

    window.clearInterval(choosingHeartbeat);
    const heartbeat = window.setInterval(() => {
      current.expiresAt = Date.now() + 120_000;
      writeTicket();
    }, 20_000);

    try {
      return await operation();
    } finally {
      window.clearInterval(heartbeat);
    }
  } finally {
    window.clearInterval(choosingHeartbeat);
    storage.removeItem(key);
  }
}

async function withRefreshLock<Result>(operation: () => Promise<Result>) {
  if ("locks" in navigator && navigator.locks) {
    return navigator.locks.request(REFRESH_LOCK_NAME, operation);
  }

  return withStorageLock(operation);
}

async function cacheSuccessfulRefresh(response: Response) {
  if (!response.ok) return;

  const payload: { data?: { expiresIn?: unknown } } = await response
    .clone()
    .json();
  const expiresIn = payload.data?.expiresIn;
  if (typeof expiresIn === "number" && Number.isFinite(expiresIn)) {
    cachedRefreshResponse = response.clone();
    cachedRefreshExpiresAt = Date.now() + expiresIn * 1000;
  }
}

async function getCachedRefreshResponse() {
  if (!cachedRefreshResponse) return null;

  const remainingSeconds = Math.ceil(
    (cachedRefreshExpiresAt - Date.now()) / 1000,
  );
  if (remainingSeconds <= 60) {
    cachedRefreshResponse = null;
    cachedRefreshExpiresAt = 0;
    return null;
  }

  const payload = (await cachedRefreshResponse.clone().json()) as {
    data?: { expiresIn?: number };
  };
  if (!payload.data) return null;

  payload.data.expiresIn = remainingSeconds;
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function refreshAcrossTabs(
  versionAtRequestStart: string | null,
  skipIfRefreshed: boolean,
): Promise<Response> {
  if (typeof window === "undefined") {
    throw new Error("Làm mới phiên chỉ được gọi từ trình duyệt");
  }

  const channel =
    typeof BroadcastChannel === "undefined"
      ? null
      : new BroadcastChannel(REFRESH_CHANNEL_NAME);
  let broadcastVersion: string | null = null;
  if (channel) {
    channel.onmessage = (event: MessageEvent<RefreshBroadcast>) => {
      if (
        event.data?.type === "refresh-completed" &&
        typeof event.data.version === "string"
      ) {
        broadcastVersion = event.data.version;
      }
    };
  }

  try {
    return await withRefreshLock(async () => {
      const currentVersion = getRefreshVersion();
      if (
        skipIfRefreshed &&
        (currentVersion !== versionAtRequestStart || broadcastVersion !== null)
      ) {
        return new Response(null, { status: 204 });
      }

      const response = await fetch("/api/auth/refresh-token", {
        method: "POST",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (response.ok) {
        announceAuthUpdated(channel);
        try {
          await cacheSuccessfulRefresh(response);
        } catch (error) {
          console.error("Không thể lưu kết quả refresh", error);
        }
      } else if (response.status === 401) {
        cachedRefreshResponse = null;
        cachedRefreshExpiresAt = 0;
      }

      return response;
    });
  } finally {
    channel?.close();
  }
}

export async function getAuthCookieState() {
  const response = await fetch("/api/auth/refresh-token", {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Không thể kiểm tra cookie phiên (${response.status})`);
  }
  return (await response.json()) as {
    hasAccessToken: boolean;
    hasRefreshToken: boolean;
  };
}

export function refreshAuthSession(options: RefreshOptions = {}) {
  const {
    force = false,
    skipIfRefreshed = false,
    versionAtRequestStart = getRefreshVersion(),
  } = options;

  if (!force) {
    return getCachedRefreshResponse().then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return getOrStartRefresh(versionAtRequestStart, skipIfRefreshed);
    });
  }

  return getOrStartRefresh(versionAtRequestStart, skipIfRefreshed);
}

function getOrStartRefresh(
  versionAtRequestStart: string | null,
  skipIfRefreshed: boolean,
): Promise<Response> {
  if (!refreshPromise) {
    refreshPromise = refreshAcrossTabs(
      versionAtRequestStart,
      skipIfRefreshed,
    ).finally(() => {
      refreshPromise = null;
    });
  }

  const activeRefresh = refreshPromise;
  return activeRefresh.then(async (response): Promise<Response> => {
    if (response.status === 204 && !skipIfRefreshed) {
      return getOrStartRefresh(getRefreshVersion(), false);
    }
    return response.clone();
  });
}

function isAuthPath(url: string, endpoint: "login" | "logout") {
  return new RegExp(`^/api/auth/${endpoint}(?:\\?|$)`).test(url);
}

export async function clearAuthSessionCookies() {
  cachedRefreshResponse = null;
  cachedRefreshExpiresAt = 0;
  try {
    const response = await fetch("/api/auth/logout?localOnly=true", {
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`Xóa cookie phiên thất bại (${response.status})`);
    }
  } catch (error) {
    console.error("Không thể xóa cookie phiên đăng nhập", error);
  }
}

export class HttpError extends Error {
  status: number;
  payload: ErrorPayload;

  constructor({
    status,
    payload,
  }: {
    status: number;
    payload: ErrorPayload;
  }) {
    super(payload.message ?? "Lỗi HTTP");
    this.name = "HttpError";
    this.status = status;
    this.payload = payload;
  }
}

export class EntityError extends HttpError {
  constructor({
    status,
    payload,
  }: {
    status: number;
    payload: ErrorPayload;
  }) {
    super({ status, payload });
    this.name = "EntityError";
  }
}

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const isAuthEndpoint = (url: string) =>
  /^\/api\/auth\/(login|logout|refresh-token)(?:\?|$)/.test(url);

async function clearSession() {
  await clearAuthSessionCookies();
  if (window.location.pathname.startsWith("/manager")) {
    window.location.replace("/login");
  }
}

function notifyForbidden(error: HttpError) {
  if (typeof window === "undefined") return;

  void import("sonner").then(({ toast }) => {
    toast.error(error.payload.message ?? "Bạn không có đủ quyền thực hiện thao tác này");
  });
}

const request = async <Result>(
  method: HttpMethod,
  url: string,
  options: CustomOptions = {},
) => {
  const {
    baseUrl = process.env.NEXT_PUBLIC_API_ENDPOINT,
    body,
    headers,
    ...restOptions
  } = options;

  if (baseUrl === undefined) {
    throw new Error("Chưa cấu hình NEXT_PUBLIC_API_ENDPOINT");
  }

  const isFormData =
    typeof FormData !== "undefined" && body instanceof FormData;

  const requestHeaders = new Headers(headers);

  requestHeaders.set("Accept", "application/json");

  if (!isFormData && body !== undefined && body !== null) {
    if (!requestHeaders.has("Content-Type")) {
      requestHeaders.set("Content-Type", "application/json");
    }
  }

  const fullUrl = `${baseUrl.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;

  const send = async () => {
    const response = await fetch(fullUrl, {
      ...restOptions,
      method,
      headers: requestHeaders,
      body:
        body === undefined || body === null
          ? undefined
          : isFormData
            ? body
            : JSON.stringify(body),
    });

    const rawText = await response.text();
    let payload: Result;

    try {
      payload = rawText ? JSON.parse(rawText) : null;
    } catch {
      throw new HttpError({
        status: response.status,
        payload: { message: "Backend trả về dữ liệu không phải JSON" },
      });
    }

    if (!response.ok) {
      const errorPayload =
        payload && typeof payload === "object"
          ? (payload as ErrorPayload)
          : { message: `Lỗi API: ${response.status}` };

      if (response.status === ENTITY_ERROR_STATUS) {
        throw new EntityError({
          status: response.status,
          payload: errorPayload,
        });
      }

      throw new HttpError({
        status: response.status,
        payload: errorPayload,
      });
    }

    if (response.ok && isAuthPath(url, "login")) {
      try {
        await cacheSuccessfulRefresh(
          new Response(rawText, {
            status: response.status,
            headers: { "Content-Type": "application/json" },
          }),
        );
        const channel =
          typeof BroadcastChannel === "undefined"
            ? null
            : new BroadcastChannel(REFRESH_CHANNEL_NAME);
        announceAuthUpdated(channel);
        channel?.close();
      } catch (error) {
        console.error("Không thể lưu phiên đăng nhập", error);
      }
    } else if (response.ok && isAuthPath(url, "logout")) {
      cachedRefreshResponse = null;
      cachedRefreshExpiresAt = 0;
    }

    return { status: response.status, payload };
  };

  const versionAtRequestStart =
    typeof window === "undefined" ? null : getRefreshVersion();

  try {
    return await send();
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    if (error.status === 403) {
      notifyForbidden(error);
      throw error;
    }

    if (
      error.status !== 401 ||
      typeof window === "undefined" ||
      isAuthEndpoint(url)
    ) {
      throw error;
    }

    let refreshed: Response;
    try {
      refreshed = await refreshAuthSession({
        force: true,
        skipIfRefreshed: true,
        versionAtRequestStart,
      });
    } catch (refreshError) {
      console.error("Không thể làm mới phiên đăng nhập", refreshError);
      throw refreshError;
    }

    if (!refreshed.ok) {
      if (refreshed.status === 401) {
        await clearSession();
        throw error;
      }

      const refreshError = new HttpError({
        status: refreshed.status,
        payload: { message: "Không thể làm mới phiên đăng nhập" },
      });
      if (refreshed.status === 403) notifyForbidden(refreshError);
      throw refreshError;
    }

    try {
      return await send();
    } catch (retryError) {
      if (retryError instanceof HttpError && retryError.status === 401) {
        await clearSession();
      } else if (retryError instanceof HttpError && retryError.status === 403) {
        notifyForbidden(retryError);
      }
      throw retryError;
    }
  }
};

const http = {
  get<Response>(
    url: string,
    options?: Omit<CustomOptions, "body">,
  ) {
    return request<Response>("GET", url, options);
  },

  post<Response>(
    url: string,
    body: unknown,
    options?: Omit<CustomOptions, "body">,
  ) {
    return request<Response>("POST", url, {
      ...options,
      body,
    });
  },

  put<Response>(
    url: string,
    body: unknown,
    options?: Omit<CustomOptions, "body">,
  ) {
    return request<Response>("PUT", url, {
      ...options,
      body,
    });
  },

  patch<Response>(
    url: string,
    body: unknown,
    options?: Omit<CustomOptions, "body">,
  ) {
    return request<Response>("PATCH", url, {
      ...options,
      body,
    });
  },

  delete<Response>(
    url: string,
    options?: Omit<CustomOptions, "body">,
  ) {
    return request<Response>("DELETE", url, options);
  },
};

export default http;
