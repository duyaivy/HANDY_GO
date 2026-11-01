import { useMutation } from "@tanstack/react-query";
import authApiRequest from "../api/auth.api";

export const useLoginMutation = () => {
  return useMutation({
    mutationFn: authApiRequest.login,
  });
};