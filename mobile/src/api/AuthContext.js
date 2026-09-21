import React, { createContext, useContext, useEffect, useState } from "react";
import client, { saveSession, loadSession, clearSession } from "./client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { token, user: storedUser } = await loadSession();
      if (token && storedUser) setUser(storedUser);
      setLoading(false);
    })();
  }, []);

  async function login(identifier, password) {
    const { data } = await client.post("/auth/login", { identifier, password });
    await saveSession(data.token, data.user);
    setUser(data.user);
    return data.user;
  }

  async function logout() {
    await clearSession();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
