import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Button, Loading } from '@/components/ui';
import { useAuthStore } from '@/stores';
import {
  getPendingAccessRequests,
  approveAccessRequest,
  rejectAccessRequest,
} from '@/services/firebase/communityFirestore';
import type { AccessRequest } from '@/types';

export function AccessRequestsAdmin() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchRequests = async () => {
    try {
      const data = await getPendingAccessRequests();
      setRequests(data);
    } catch (error) {
      console.error('Error fetching access requests:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleApprove = async (requestId: string) => {
    if (!user) return;

    setProcessingId(requestId);
    try {
      await approveAccessRequest(requestId, user.uid);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (error) {
      console.error('Error approving request:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!user) return;

    const reason = window.prompt(t('admin.rejectReasonPrompt'));
    if (reason === null) return; // User cancelled

    setProcessingId(requestId);
    try {
      await rejectAccessRequest(requestId, user.uid, reason || undefined);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (error) {
      console.error('Error rejecting request:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('default', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  if (isLoading) {
    return <Loading size="lg" text={t('common.loading')} />;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-charcoal">
            {t('admin.accessRequests')}
          </h1>
          <p className="text-gray-500">{t('admin.accessRequestsDescription')}</p>
        </div>
      </div>

      {requests.length > 0 ? (
        <div className="space-y-4">
          {requests.map((request) => (
            <Card key={request.id}>
              <div className="space-y-4">
                {/* Request header */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-charcoal">{request.userName}</h3>
                    <p className="text-sm text-gray-500">{request.userEmail}</p>
                    <p className="text-sm text-gray-500">
                      {t('admin.requestedAt')} {formatDate(request.createdAt)}
                    </p>
                  </div>
                </div>

                {/* Request details */}
                <div className="p-4 bg-gray-50 rounded-lg space-y-2">
                  {request.pwz && (
                    <div>
                      <span className="text-sm font-medium text-gray-700">
                        {t('community.pwzLabel')}:
                      </span>{' '}
                      <span className="text-sm text-charcoal">{request.pwz}</span>
                    </div>
                  )}
                  {request.description && (
                    <div>
                      <span className="text-sm font-medium text-gray-700">
                        {t('community.descriptionLabel')}:
                      </span>
                      <p className="text-sm text-charcoal mt-1">{request.description}</p>
                    </div>
                  )}
                  {!request.pwz && !request.description && (
                    <p className="text-sm text-gray-500 italic">
                      {t('admin.noAdditionalInfo')}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleApprove(request.id)}
                    disabled={processingId === request.id}
                    isLoading={processingId === request.id}
                  >
                    {t('admin.approve')}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleReject(request.id)}
                    disabled={processingId === request.id}
                  >
                    {t('admin.reject')}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <div className="text-center py-12">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-12 w-12 text-green-500 mx-auto mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h3 className="text-lg font-medium text-charcoal mb-2">
              {t('admin.noPendingRequests')}
            </h3>
            <p className="text-gray-500">{t('admin.allRequestsReviewed')}</p>
          </div>
        </Card>
      )}
    </div>
  );
}
