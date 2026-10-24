
type CustomOptions = Omit<RequestInit, "method" | "body"> & {
  baseUrl?: string;
  body?: unknown;
};

const ENTITY_ERROR_STATUS = 422;

type ErrorPayload = {
  message?: string;
  [key: string]: unknown;
};

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

const request = async <Response>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
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

  let payload: Response;

  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch {
    throw new HttpError({
      status: response.status,
      payload: {
        message: "Backend trả về dữ liệu không phải JSON",
      },
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

  return {
    status: response.status,
    payload,
  };
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
