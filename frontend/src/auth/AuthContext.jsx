import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api/client.js";

const AuthContext = createContext(null);

function readStoredUser() {
  try {
    if (!sessionStorage.getItem("messmateToken")) return null;
    return JSON.parse(sessionStorage.getItem("messmateUser") || "null");
  } catch {
    sessionStorage.removeItem("messmateUser");
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);

  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener("messmate:unauthorized", onUnauthorized);
    return () => window.removeEventListener("messmate:unauthorized", onUnauthorized);
  }, []);

  function saveSession(result) {
    sessionStorage.setItem("messmateToken", result.token);
    sessionStorage.setItem("messmateUser", JSON.stringify(result.user));
    setUser(result.user);
    return result.user;
  }

  async function login(credentials) {
    const result = await apiRequest("/auth/login", {
      method: "POST",
      body: credentials,
      authenticated: false,
    });
    return saveSession(result);
  }

  async function register(details) {
    const result = await apiRequest("/auth/register", {
      method: "POST",
      body: details,
      authenticated: false,
    });
    return saveSession(result);
  }

  function logout() {
    sessionStorage.removeItem("messmateToken");
    sessionStorage.removeItem("messmateUser");
    setUser(null);
  }

  const value = useMemo(() => ({ user, login, register, logout }), [user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider.");
  return context;
}
