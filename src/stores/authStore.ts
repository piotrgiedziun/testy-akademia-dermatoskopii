import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types';
import { signIn, signUp, signOut, getUserData, subscribeToAuthChanges, signInWithGoogle, acceptTerms as acceptTermsService } from '@/services/firebase/auth';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  acceptTerms: () => Promise<void>;
  clearError: () => void;
  initialize: () => () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoading: false,
      isInitialized: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const user = await signIn(email, password);
          set({ user, isLoading: false });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Login failed';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      loginWithGoogle: async () => {
        set({ isLoading: true, error: null });
        try {
          const user = await signInWithGoogle();
          set({ user, isLoading: false });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Google login failed';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      register: async (email: string, password: string, displayName: string) => {
        set({ isLoading: true, error: null });
        try {
          const user = await signUp(email, password, displayName);
          set({ user, isLoading: false });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Registration failed';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        set({ isLoading: true, error: null });
        try {
          await signOut();
          set({ user: null, isLoading: false });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Logout failed';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      acceptTerms: async () => {
        const currentUser = useAuthStore.getState().user;
        if (!currentUser) return;

        try {
          await acceptTermsService(currentUser.uid);
          set({
            user: {
              ...currentUser,
              termsAcceptedAt: new Date(),
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to accept terms';
          set({ error: message });
          throw error;
        }
      },

      clearError: () => set({ error: null }),

      initialize: () => {
        const unsubscribe = subscribeToAuthChanges(async (firebaseUser) => {
          if (firebaseUser) {
            try {
              const userData = await getUserData(firebaseUser.uid);
              set({ user: userData, isInitialized: true });
            } catch {
              set({ user: null, isInitialized: true });
            }
          } else {
            set({ user: null, isInitialized: true });
          }
        });
        return unsubscribe;
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user }),
    }
  )
);
