import { useQueries, useQuery } from "@tanstack/react-query";
import usersApiRequest from "../api/users.api";

const USER_QUERY_KEY = ["users", "detail"] as const;

const getUserQueryOptions = (id: string) => ({
  queryKey: [...USER_QUERY_KEY, id],
  queryFn: async () =>
    (await usersApiRequest.detail(id)).payload.data,
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
});

export const useUserDetailQuery = (id?: string) =>
  useQuery({
    ...getUserQueryOptions(id ?? ""),
    enabled: Boolean(id),
  });

export const useOrderUsersQuery = (userIds: string[]) =>
  useQueries({
    queries: [...new Set(userIds)].filter(Boolean).map(
      (id) => getUserQueryOptions(id),
    ),
  });