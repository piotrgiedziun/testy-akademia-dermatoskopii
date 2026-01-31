import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Layout } from '@/components/layout';
import { Card, Button, Input, Loading } from '@/components/ui';
import { useAuthStore } from '@/stores';
import {
  createAccessRequest,
  getUserAccessRequest,
} from '@/services/firebase/communityFirestore';
import type { AccessRequest } from '@/types';

export function AccessRequestPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [existingRequest, setExistingRequest] = useState<AccessRequest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pwz, setPwz] = useState('');
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const fetchExistingRequest = async () => {
      if (!user) return;

      try {
        const request = await getUserAccessRequest(user.uid);
        setExistingRequest(request);
      } catch (error) {
        console.error('Error fetching existing request:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchExistingRequest();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSubmitting(true);
    try {
      await createAccessRequest(user.uid, user.email, user.displayName, {
        pwz: pwz.trim() || undefined,
        description: description.trim() || undefined,
      });
      setSubmitted(true);
    } catch (error) {
      console.error('Error submitting request:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <Loading size="lg" text={t('common.loading')} />
      </Layout>
    );
  }

  // Show status if request already exists
  if (existingRequest || submitted) {
    const request = existingRequest;
    const status = submitted ? 'pending' : request?.status;

    return (
      <Layout>
        <div className="max-w-xl mx-auto">
          <Card>
            <div className="text-center py-8">
              {status === 'pending' && (
                <>
                  <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg
                      className="w-8 h-8 text-yellow-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <h2 className="text-xl font-semibold text-charcoal mb-2">
                    {t('community.requestPending')}
                  </h2>
                  <p className="text-gray-600">{t('community.requestPendingDescription')}</p>
                </>
              )}

              {status === 'approved' && (
                <>
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg
                      className="w-8 h-8 text-green-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <h2 className="text-xl font-semibold text-charcoal mb-2">
                    {t('community.requestApproved')}
                  </h2>
                  <p className="text-gray-600">{t('community.requestApprovedDescription')}</p>
                </>
              )}

              {status === 'rejected' && (
                <>
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg
                      className="w-8 h-8 text-red-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </div>
                  <h2 className="text-xl font-semibold text-charcoal mb-2">
                    {t('community.requestRejected')}
                  </h2>
                  <p className="text-gray-600">
                    {request?.rejectionReason || t('community.requestRejectedDescription')}
                  </p>
                </>
              )}
            </div>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-charcoal mb-2">
            {t('community.title')}
          </h1>
          <p className="text-gray-600">{t('community.accessRequired')}</p>
        </div>

        <Card>
          <h2 className="text-lg font-semibold text-charcoal mb-4">
            {t('community.requestAccess')}
          </h2>
          <p className="text-gray-600 mb-6">{t('community.requestAccessDescription')}</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label={t('community.pwzLabel')}
              value={pwz}
              onChange={(e) => setPwz(e.target.value)}
              placeholder={t('community.pwzPlaceholder')}
              helperText={t('community.pwzHelper')}
            />

            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">
                {t('community.descriptionLabel')} ({t('common.optional')})
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('community.descriptionPlaceholder')}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                rows={3}
              />
            </div>

            <Button
              type="submit"
              fullWidth
              isLoading={isSubmitting}
              disabled={isSubmitting}
            >
              {t('community.submitRequest')}
            </Button>
          </form>
        </Card>
      </div>
    </Layout>
  );
}
