import { useContext } from 'react';
import { ReCaptchaContext } from './ReCaptchaContext';

export function useReCaptcha() {
  return useContext(ReCaptchaContext);
}
