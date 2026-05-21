"use client";

import { useCallback } from "react";
import { useAuth } from "@/presentation/auth/AuthContext";

export function useAuthenticatedFetch() {
  const { getIdToken } = useAuth();

  return useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const token = await getIdToken();
      const headers = new Headers(init.headers);
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      return fetch(input, { ...init, headers });
    },
    [getIdToken]
  );
}

