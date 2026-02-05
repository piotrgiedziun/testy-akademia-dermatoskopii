import { createContext } from 'react';

export interface ReCaptchaContextValue {
  executeReCaptcha: (action: string) => Promise<string | null>;
  isEnabled: boolean;
  isReady: boolean;
}

export const ReCaptchaContext = createContext<ReCaptchaContextValue>({
  executeReCaptcha: async () => 'disabled',
  isEnabled: false,
  isReady: true,
});
