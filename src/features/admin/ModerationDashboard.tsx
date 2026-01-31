import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, Button, Loading } from '@/components/ui';
import { useAuthStore } from '@/stores';
import {
  getUnresolvedFlags,
  resolveFlag,
  getCommunityCase,
  getCaseComments,
  deleteCommunityCase,
  deleteCaseComment,
} from '@/services/firebase/communityFirestore';
import { deleteObject, ref } from 'firebase/storage';
import { storage } from '@/services/firebase/config';
import type { ContentFlag, CommunityCase, CaseComment } from '@/types';

interface FlagWithContent extends ContentFlag {
  content?: {
    case?: CommunityCase;
    comment?: CaseComment;
  };
}

export function ModerationDashboard() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [flags, setFlags] = useState<FlagWithContent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const fetchFlags = async () => {
    try {
      const flagsData = await getUnresolvedFlags();

      // Fetch content for each flag
      const flagsWithContent: FlagWithContent[] = await Promise.all(
        flagsData.map(async (flag) => {
          const content: FlagWithContent['content'] = {};

          if (flag.contentType === 'case') {
            content.case = (await getCommunityCase(flag.contentId)) || undefined;
          } else {
            const comments = await getCaseComments(flag.caseId);
            content.comment = comments.find((c) => c.id === flag.contentId);
            content.case = (await getCommunityCase(flag.caseId)) || undefined;
          }

          return { ...flag, content };
        })
      );

      setFlags(flagsWithContent);
    } catch (error) {
      console.error('Error fetching flags:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFlags();
  }, []);

  const isAdmin = user?.role === 'admin';

  const handleResolve = async (flagId: string, resolution: 'dismissed' | 'hidden') => {
    if (!user) return;

    setResolvingId(flagId);
    try {
      await resolveFlag(flagId, user.uid, resolution);
      setFlags((prev) => prev.filter((f) => f.id !== flagId));
    } catch (error) {
      console.error('Error resolving flag:', error);
    } finally {
      setResolvingId(null);
    }
  };

  const handleDelete = async (flag: FlagWithContent) => {
    if (!user || !isAdmin) return;

    const confirmMessage =
      flag.contentType === 'case'
        ? t('admin.confirmDeleteCase')
        : t('admin.confirmDeleteComment');

    if (!window.confirm(confirmMessage)) return;

    setResolvingId(flag.id);
    try {
      if (flag.contentType === 'case' && flag.content?.case) {
        // Delete images from storage
        for (const image of flag.content.case.images) {
          try {
            const imageRef = ref(storage, image.url);
            await deleteObject(imageRef);
          } catch (e) {
            console.warn('Could not delete image:', e);
          }
        }
        // Delete the case document
        await deleteCommunityCase(flag.contentId);
      } else if (flag.contentType === 'comment') {
        // Delete the comment
        await deleteCaseComment(flag.caseId, flag.contentId);
      }

      // Mark flag as resolved with 'deleted' resolution
      await resolveFlag(flag.id, user.uid, 'hidden');
      setFlags((prev) => prev.filter((f) => f.id !== flag.id));
    } catch (error) {
      console.error('Error deleting content:', error);
    } finally {
      setResolvingId(null);
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('default', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const getReasonLabel = (reason: string) => {
    const knownReasons = ['inappropriate', 'spam', 'misinformation', 'harassment', 'other'];
    if (knownReasons.includes(reason)) {
      return t(`community.flagReasons.${reason}`);
    }
    return reason;
  };

  if (isLoading) {
    return <Loading size="lg" text={t('common.loading')} />;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-charcoal">{t('admin.moderation')}</h1>
          <p className="text-gray-500">{t('admin.moderationDescription')}</p>
        </div>
      </div>

      {flags.length > 0 ? (
        <div className="space-y-4">
          {flags.map((flag) => (
            <Card key={flag.id} data-testid="flagged-item">
              <div className="space-y-4">
                {/* Flag header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded ${
                          flag.contentType === 'case'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-purple-100 text-purple-700'
                        }`}
                      >
                        {flag.contentType === 'case'
                          ? t('admin.flaggedCase')
                          : t('admin.flaggedComment')}
                      </span>
                      <span className="px-2 py-1 text-xs font-medium rounded bg-red-100 text-red-700">
                        {getReasonLabel(flag.reason)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {t('admin.reportedBy')} {flag.reporterName} &bull;{' '}
                      {formatDate(flag.createdAt)}
                    </p>
                  </div>
                </div>

                {/* Flagged content preview */}
                <div className="p-4 bg-gray-50 rounded-lg">
                  {flag.contentType === 'case' && flag.content?.case && (
                    <div>
                      <h3 className="font-semibold text-charcoal">
                        {flag.content.case.title}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {t('community.by')} {flag.content.case.authorName}
                      </p>
                      <p className="text-gray-700 mt-2 line-clamp-3">
                        {flag.content.case.description}
                      </p>
                      {flag.content.case.images.length > 0 && (
                        <div className="flex gap-2 mt-3">
                          {flag.content.case.images.slice(0, 3).map((img) => (
                            <img
                              key={img.id}
                              src={img.url}
                              alt=""
                              className="w-16 h-16 object-cover rounded"
                            />
                          ))}
                          {flag.content.case.images.length > 3 && (
                            <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center text-sm text-gray-500">
                              +{flag.content.case.images.length - 3}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {flag.contentType === 'comment' && flag.content?.comment && (
                    <div>
                      <p className="text-sm text-gray-500">
                        {t('admin.commentOn')}{' '}
                        <Link
                          to={`/community/case/${flag.caseId}`}
                          className="text-primary hover:underline"
                        >
                          {flag.content.case?.title || flag.caseId}
                        </Link>
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        {t('community.by')} {flag.content.comment.authorName}
                      </p>
                      <p className="text-gray-700 mt-2">{flag.content.comment.text}</p>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 flex-wrap">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleResolve(flag.id, 'hidden')}
                    disabled={resolvingId === flag.id}
                    isLoading={resolvingId === flag.id}
                  >
                    {t('admin.hideContent')}
                  </Button>
                  {isAdmin && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDelete(flag)}
                      disabled={resolvingId === flag.id}
                      isLoading={resolvingId === flag.id}
                    >
                      {t('admin.deleteContent')}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleResolve(flag.id, 'dismissed')}
                    disabled={resolvingId === flag.id}
                  >
                    {t('admin.dismissFlag')}
                  </Button>
                  <Link
                    to={`/community/case/${flag.caseId}`}
                    className="text-sm text-primary hover:underline ml-auto"
                  >
                    {t('admin.viewCase')}
                  </Link>
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
              {t('admin.noFlaggedContent')}
            </h3>
            <p className="text-gray-500">{t('admin.allClear')}</p>
          </div>
        </Card>
      )}
    </div>
  );
}
