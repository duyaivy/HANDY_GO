
import http from "@/shared/api/http";
import type { SuccessResponse } from "@/shared/constants/type";
import queryString from "query-string";

import type {
  UserResponse,
  UserListQuery,
  UserListResponse,
} from "../types";

const BASE_PATH = "/api/users";

const usersApiRequest = {
  list: (query: UserListQuery) => {
    const searchParams = queryString.stringify(query, {
      skipNull: true,
      skipEmptyString: true,
    });

    return http.get<UserListResponse>(
      `${BASE_PATH}${searchParams ? `?${searchParams}` : ""}`,
      { baseUrl: "", cache: "no-store" },
    );
  },

  detail: (id: string) =>
    http.get<SuccessResponse<UserResponse>>(
      `${BASE_PATH}/${encodeURIComponent(id)}`,
      { baseUrl: "", cache: "no-store" },
    ),
};

export default usersApiRequest;
