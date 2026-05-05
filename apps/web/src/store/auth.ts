import type { User } from '@pdi/contracts';
import { create } from 'zustand';
import { api, setToken } from '../api/client';

type AuthState = {
  user: User | null;
  isBootstrapping: boolean;
  createBootstrapAdmin: (input: { email: string; name: string; password: string }) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  bootstrap: () => Promise<void>;
};

export const useAuth = create<AuthState>((set) => ({
  user: null,
  isBootstrapping: true,
  createBootstrapAdmin: async (input) => {
    const session = await api.createBootstrapAdmin(input);
    setToken(session.token);
    set({ user: session.user });
  },
  login: async (email, password) => {
    const session = await api.login({ email, password });
    setToken(session.token);
    set({ user: session.user });
  },
  logout: () => {
    setToken(null);
    set({ user: null });
  },
  bootstrap: async () => {
    try {
      const user = await api.me();
      set({ user, isBootstrapping: false });
    } catch {
      setToken(null);
      set({ user: null, isBootstrapping: false });
    }
  }
}));
