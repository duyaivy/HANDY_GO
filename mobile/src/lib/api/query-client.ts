import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: process.env.NODE_ENV === 'test' ? false : 2,
      gcTime: process.env.NODE_ENV === 'test' ? 0 : 1000 * 60 * 5,
      staleTime: process.env.NODE_ENV === 'test' ? 0 : 1000 * 60 * 2,
    },
  },
});
