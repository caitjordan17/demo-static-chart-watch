import { createContext, useContext, useState } from 'react';
import { users } from '../lib/demoStore';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return users.find(u => u.id === Number(sessionStorage.getItem('chartwatch-demo-user'))) || null; }
    catch { return null; }
  });

  const logout = () => {
    try { sessionStorage.removeItem('chartwatch-demo-user'); } catch { /* View still switches without storage. */ }
    setUser(null);
  };

  const login = (username, password) => {
    const account = users.find(u => u.username === username.trim());
    const expectedPassword = account?.role === 'admin' ? 'Admin123!' : 'Coder123!';
    if (!account || password !== expectedPassword) throw new Error('Use one of the demo accounts shown below.');
    try { sessionStorage.setItem('chartwatch-demo-user', String(account.id)); } catch { /* Session lasts until refresh. */ }
    setUser(account);
    return account;
  };

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
