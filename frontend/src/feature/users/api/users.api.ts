
import http from "@/shared/api/http";
import type { SuccessResponse } from "@/shared/constants/type";
import { UserResponse } from "../types";


const BASE_PATH = "/api/users";

const usersApiRequest = {
  detail: (id: string) =>
    http.get<SuccessResponse<UserResponse>>(
      `${BASE_PATH}/${encodeURIComponent(id)}`,
      { baseUrl: "", cache: "no-store" },
    ),
};

export default usersApiRequest;