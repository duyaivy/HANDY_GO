
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

export function refreshAuthSession() {
  if (!refreshPromise) {
    refreshPromise = fetch("/api/auth/refresh-token", {
      method: "POST",
      headers: { Accept: "application/json" },
    }).finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
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
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch (error) {
    console.error("Không thể xóa phiên đăng nhập", error);
  }

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

    return { status: response.status, payload };
  };

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
      refreshed = await refreshAuthSession();
    } catch (refreshError) {
      console.error("Không thể làm mới phiên đăng nhập", refreshError);
      throw error;
    }

    if (!refreshed.ok) {
      if (refreshed.status === 401) await clearSession();
      throw error;
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
