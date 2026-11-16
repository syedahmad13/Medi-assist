import { createContext, useContext, useEffect, useState } from "react";
import { clearSession, getUser, saveSession } from "../services/api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getUser);

  // api.js fires this when the server says the token is no longer valid
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener("auth:expired", onExpired);
    return () => window.removeEventListener("auth:expired", onExpired);
  }, []);

  const login = (session) => { saveSession(session); setUser(session.user); };
  const logout = () => { clearSession(); setUser(null); };

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
