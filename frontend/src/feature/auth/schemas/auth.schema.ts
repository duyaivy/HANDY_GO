export type LoginBodyType = {
  phone: string;
  password: string;
};

export type RefreshTokenBodyType = {
  refreshToken: string;
};

export type LogoutBodyType = {
  refreshToken: string;
};

export type AuthUserType = {
  id: string;
  phone: string;
  email: string | null;
  roles: string[];
  permissions: string[];
};

export type LoginResType = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUserType;
};

export type RefreshTokenResType = LoginResType;

// Response trả về trình duyệt, không chứa token
export type AuthClientResType = {
  user: AuthUserType;
  expiresIn: number;
};