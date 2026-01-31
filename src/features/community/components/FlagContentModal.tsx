import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Button, Input } from '@/components/ui';
import { useAuthStore } from '@/stores';
import { createContentFlag } from '@/services/firebase/communityFirestore';

interface FlagContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  contentType: 'case' | 'comment';
  contentId: string;
  caseId: string;
  onFlagged: () => void;
}

const FLAG_REASONS = [
  'inappropriate',
  'spam',
  'misinformation',
  'harassment',
  'other',
];

export function FlagContentModal({
  isOpen,
  onClose,
  contentType,
  contentId,
  caseId,
  onFlagged,
}: FlagContentModalProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [customReason, setCustomReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user || !selectedReason) return;

    const reason = selectedReason === 'other' ? customReason : selectedReason;
    if (!reason.trim()) return;

    setIsSubmitting(true);
    try {
      await createContentFlag(
        contentType,
        contentId,
        caseId,
        user.uid,
        user.displayName,
        reason
      );
      onFlagged();
    } catch (error) {
      console.error('Error flagging content:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedReason(null);
    setCustomReason('');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('community.flagContent')}
    >
      <div className="space-y-4">
        <p className="text-gray-600">{t('community.flagDescription')}</p>

        <div className="space-y-2">
          {FLAG_REASONS.map((reason) => (
            <label
              key={reason}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedReason === reason
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="flagReason"
                value={reason}
                checked={selectedReason === reason}
                onChange={() => setSelectedReason(reason)}
                className="text-primary focus:ring-primary"
              />
              <span>{t(`community.flagReasons.${reason}`)}</span>
            </label>
          ))}
        </div>

        {selectedReason === 'other' && (
          <Input
            label={t('community.specifyReason')}
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            placeholder={t('community.reasonPlaceholder')}
          />
        )}

        <div className="flex gap-3 pt-4">
          <Button variant="secondary" fullWidth onClick={handleClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            fullWidth
            onClick={handleSubmit}
            disabled={
              !selectedReason ||
              (selectedReason === 'other' && !customReason.trim()) ||
              isSubmitting
            }
            isLoading={isSubmitting}
          >
            {t('community.submitFlag')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
