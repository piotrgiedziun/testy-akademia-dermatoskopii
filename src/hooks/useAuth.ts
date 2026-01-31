import { useEffect } from 'react';
import { useAuthStore } from '@/stores';

export function useAuth() {
  const { user, isLoading, isInitialized, initialize } = useAuthStore();

  useEffect(() => {
    const unsubscribe = initialize();
    return unsubscribe;
  }, [initialize]);

  return { user, isLoading, isInitialized };
}
