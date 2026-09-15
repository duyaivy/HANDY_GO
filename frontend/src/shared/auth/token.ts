import authApiRequest from "@/features/auth/api/auth.api";
import jwt from "jsonwebtoken";
import { TokenPayload } from "@/shared/types/jwt.types";
import guestApiRequest from "@/features/guest/api/guest.api";
import { Role } from "../constants/type";

const isBrowser = typeof window !== "undefined";

export const getAccessTokenFromLocalStorage = () => {
  return isBrowser ? localStorage.getItem("accessToken") : null;
};

export const getRefreshTokenFromLocalStorage = () => {
  return isBrowser ? localStorage.getItem("refreshToken") : null;
};

export const setAccessTokenToLoacalStorage = (value: string) => {
  if (isBrowser) {
    localStorage.setItem("accessToken", value);
  }
};

export const setRefreshTokenToLoacalStorage = (value: string) => {
  if (isBrowser) {
    localStorage.setItem("refreshToken", value);
  }
};

export const removeTokensFromLocalStorage = () => {
  if (isBrowser) {
    localStorage.removeItem("accessToken");
  }
  if (isBrowser) {
    localStorage.removeItem("refreshToken");
  }
};

export const checkAndRefreshToken = async (param?: {
  onError?: () => void;
  onSuccess?: () => void;
}) => {
  const refreshToken = getRefreshTokenFromLocalStorage();
  const accessToken = getAccessTokenFromLocalStorage();

  if (!refreshToken || !accessToken) return;
  const decodeAccessToken = decodeToken(accessToken);
  const decodeRefreshToken = decodeToken(refreshToken);
  const now = Math.round(new Date().getTime() / 1000);
  if (decodeRefreshToken.exp <= now) return;

  if (
    decodeAccessToken.exp - now <
    (decodeAccessToken.exp - decodeAccessToken.iat) / 3
  ) {
    try {
      const role = decodeRefreshToken.role;
      const res = role=== Role.Guest? (await guestApiRequest.refreshToken()):(await authApiRequest.refreshToken() );
      setAccessTokenToLoacalStorage(res.payload.data.accessToken);
      setRefreshTokenToLoacalStorage(res.payload.data.refreshToken);
      if (param?.onSuccess) {
        param.onSuccess();
      }
    } catch (_) {
      if (param?.onError) {
        param.onError();
      }
    }
  }
};

export const decodeToken = (token: string) => {
  return jwt.decode(token) as TokenPayload;
};
