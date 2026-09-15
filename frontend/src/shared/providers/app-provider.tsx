"use client";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RefreshToken from "@/features/auth/components/refresh-token";
import {
  decodeToken,
  getAccessTokenFromLocalStorage,
  removeTokensFromLocalStorage,
} from "@/shared/lib/utils";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createContext } from "react";
import { RoleType } from "@/shared/types/jwt.types";

type AppContextType = {
  role: RoleType | null;
  setRole: (role?: RoleType | null) => void;
  refreshRoleFromToken: () => void;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  },
});
const AppContext = createContext<AppContextType>({
  role: null,
  setRole: () => { },
  refreshRoleFromToken: () => { },
});
export const useAppContext = () => {
  return useContext(AppContext);
};
export default function AppProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [roleState, setRoleState] = useState(() => {
    const token = getAccessTokenFromLocalStorage();

    if (!token) return null;

    try {
      const decoded = decodeToken(token);
      return decoded?.role ?? null;
    } catch {
      removeTokensFromLocalStorage();
      return null;
    }
  });

  const refreshRoleFromToken = useCallback(() => {
    const token = getAccessTokenFromLocalStorage();

    if (!token) {
      setRoleState(null);
      return;
    }

    try {
      const decoded = decodeToken(token);
      setRoleState(decoded?.role ?? null);
    } catch {
      removeTokensFromLocalStorage();
      setRoleState(null);
    }
  }, []);

  const setRole = useCallback((role?: RoleType | null) => {
    setRoleState(role ?? null);
  }, []);

  useEffect(() => {
    refreshRoleFromToken();

    const onStorage = (event: StorageEvent) => {
      if (event.key === "accessToken" || event.key === null) {
        refreshRoleFromToken();
      }
    };

    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, [refreshRoleFromToken]);

  const appContextValue = useMemo(
    () => ({
      role: roleState,
      setRole,
      refreshRoleFromToken,
    }),
    [refreshRoleFromToken, roleState, setRole],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AppContext.Provider value={appContextValue}>
        {children}
        <RefreshToken />
        <ReactQueryDevtools initialIsOpen={false} />
      </AppContext.Provider>
    </QueryClientProvider>
  );
}
