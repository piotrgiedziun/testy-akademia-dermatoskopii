import { ReactNode, useCallback } from 'react';
import { GoogleReCaptchaProvider, useGoogleReCaptcha } from 'react-google-recaptcha-v3';
import { ReCaptchaContext } from './ReCaptchaContext';

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '';
const USE_EMULATORS = import.meta.env.VITE_USE_EMULATORS === 'true';
const IS_ENABLED = !USE_EMULATORS && !!RECAPTCHA_SITE_KEY;

// Inner provider that uses the Google reCAPTCHA hook
function ReCaptchaContextProvider({ children }: { children: ReactNode }) {
  const { executeRecaptcha } = useGoogleReCaptcha();

  const executeReCaptcha = useCallback(
    async (action: string): Promise<string | null> => {
      if (!executeRecaptcha) {
        console.warn('reCAPTCHA not ready');
        return null;
      }

      try {
        return await executeRecaptcha(action);
      } catch (error) {
        console.error('reCAPTCHA error:', error);
        return null;
      }
    },
    [executeRecaptcha]
  );

  return (
    <ReCaptchaContext.Provider
      value={{
        executeReCaptcha,
        isEnabled: true,
        isReady: !!executeRecaptcha,
      }}
    >
      {children}
    </ReCaptchaContext.Provider>
  );
}

// Disabled provider for emulator/test mode
function DisabledReCaptchaProvider({ children }: { children: ReactNode }) {
  const executeReCaptcha = useCallback(async (): Promise<string | null> => {
    return 'test-token-emulator-mode';
  }, []);

  return (
    <ReCaptchaContext.Provider
      value={{
        executeReCaptcha,
        isEnabled: false,
        isReady: true,
      }}
    >
      {children}
    </ReCaptchaContext.Provider>
  );
}

// Main provider that decides which implementation to use
export function ReCaptchaProvider({ children }: { children: ReactNode }) {
  // Skip reCAPTCHA in emulator mode (E2E tests) or if no site key
  if (!IS_ENABLED) {
    return <DisabledReCaptchaProvider>{children}</DisabledReCaptchaProvider>;
  }

  return (
    <GoogleReCaptchaProvider
      reCaptchaKey={RECAPTCHA_SITE_KEY}
      scriptProps={{
        async: true,
        defer: true,
        appendTo: 'head',
      }}
    >
      <ReCaptchaContextProvider>{children}</ReCaptchaContextProvider>
    </GoogleReCaptchaProvider>
  );
}
