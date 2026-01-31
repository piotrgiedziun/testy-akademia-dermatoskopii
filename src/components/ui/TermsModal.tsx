import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';

interface TermsModalProps {
  isOpen: boolean;
  onAccept: () => Promise<void>;
  onDecline: () => void;
}

export function TermsModal({ isOpen, onAccept, onDecline }: TermsModalProps) {
  const { t } = useTranslation();
  const [isAccepting, setIsAccepting] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const element = e.currentTarget;
    const isAtBottom =
      element.scrollHeight - element.scrollTop <= element.clientHeight + 50;
    if (isAtBottom) {
      setHasScrolledToBottom(true);
    }
  };

  const handleAccept = async () => {
    setIsAccepting(true);
    try {
      await onAccept();
    } finally {
      setIsAccepting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" data-testid="terms-modal">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col" data-testid="terms-content">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-charcoal">
            {t('terms.title')}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {t('terms.subtitle')}
          </p>
        </div>

        <div
          className="flex-1 overflow-y-auto p-6 text-sm text-gray-700 space-y-4"
          onScroll={handleScroll}
        >
          <h3 className="font-semibold text-charcoal">{t('terms.section1Title')}</h3>
          <p>{t('terms.section1Content')}</p>

          <h3 className="font-semibold text-charcoal">{t('terms.section2Title')}</h3>
          <p>{t('terms.section2Content')}</p>

          <h3 className="font-semibold text-charcoal">{t('terms.section3Title')}</h3>
          <p>{t('terms.section3Content')}</p>

          <h3 className="font-semibold text-charcoal">{t('terms.section4Title')}</h3>
          <p>{t('terms.section4Content')}</p>

          <h3 className="font-semibold text-charcoal">{t('terms.section5Title')}</h3>
          <p>{t('terms.section5Content')}</p>

          <h3 className="font-semibold text-charcoal">{t('terms.section6Title')}</h3>
          <p>{t('terms.section6Content')}</p>
        </div>

        <div className="p-6 border-t border-gray-200 flex flex-col sm:flex-row gap-3">
          <Button
            variant="outline"
            onClick={onDecline}
            disabled={isAccepting}
            className="flex-1"
          >
            {t('terms.decline')}
          </Button>
          <Button
            onClick={handleAccept}
            disabled={!hasScrolledToBottom || isAccepting}
            isLoading={isAccepting}
            className="flex-1"
          >
            {hasScrolledToBottom ? t('terms.accept') : t('terms.scrollToAccept')}
          </Button>
        </div>
      </div>
    </div>
  );
}
