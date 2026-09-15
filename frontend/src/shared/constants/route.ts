export const ROUTES = {
  PUBLIC: {
    HOME: "/",

    SERVICES: "/services",
    SERVICE_DETAIL: (slug: string) =>
      `/services/${slug}`,

    WORKERS: "/workers",
    WORKER_DETAIL: (id: string) =>
      `/workers/${id}`,

    MAP: "/map",

    DOWNLOAD_APP: "/download-app",
  },

  AUTH: {
    LOGIN: "/login",
  },

  MANAGER: {
    ROOT: "/manager",

    DASHBOARD: "/manager/dashboard",

    CUSTOMERS: {
      ROOT: "/manager/customers",
      DETAIL: (id: string) =>
        `/manager/customers/${id}`,
    },

    WORKERS: {
      ROOT: "/manager/workers",
      DETAIL: (id: string) =>
        `/manager/workers/${id}`,
    },

    WORKER_APPLICATIONS: {
      ROOT: "/manager/worker-applications",
      DETAIL: (id: string) =>
        `/manager/worker-applications/${id}`,
    },

    ORDERS: {
      ROOT: "/manager/orders",
      DETAIL: (id: string) =>
        `/manager/orders/${id}`,
    },

    PAYMENTS: {
      ROOT: "/manager/payments",
      TRANSACTIONS: "/manager/payments/transactions",
      REFUNDS: "/manager/payments/refunds",
      PAYOUTS: "/manager/payments/payouts",
      FEES: "/manager/payments/fees",
    },

    CATALOGS: "/manager/catalogs",

    COMPLAINTS: {
      ROOT: "/manager/complaints",
      DETAIL: (id: string) =>
        `/manager/complaints/${id}`,
    },

    REVIEWS: {
      ROOT: "/manager/reviews",
      DETAIL: (id: string) =>
        `/manager/reviews/${id}`,
    },

    ANALYTICS: {
      ROOT: "/manager/analytics",
      REVENUE: "/manager/analytics/revenue",
      AREAS: "/manager/analytics/areas",
      OCCUPATIONS: "/manager/analytics/occupations",
      WORKERS: "/manager/analytics/workers",
    },
  },
} as const;