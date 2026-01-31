import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Layout } from '@/components/layout';
import { Loading, Card } from '@/components/ui';
import { useAuthStore } from '@/stores';
import {
  CaseImageGallery,
  DiagnosisReveal,
  CommentList,
  CommentForm,
  FlagContentModal,
} from '../components';
import {
  getCommunityCase,
  getCaseComments,
  deleteCommunityCase,
} from '@/services/firebase/communityFirestore';
import { deleteObject, ref } from 'firebase/storage';
import { storage } from '@/services/firebase/config';
import type { CommunityCase, CaseComment } from '@/types';

export function CaseDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [caseData, setCaseData] = useState<CommunityCase | null>(null);
  const [comments, setComments] = useState<CaseComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null);
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isAdmin = user?.role === 'admin';

  const fetchData = useCallback(async () => {
    if (!caseId) return;

    try {
      const [caseResult, commentsResult] = await Promise.all([
        getCommunityCase(caseId),
        getCaseComments(caseId),
      ]);

      if (!caseResult) {
        navigate('/community');
        return;
      }

      setCaseData(caseResult);
      setComments(commentsResult);
    } catch (error) {
      console.error('Error fetching case:', error);
    } finally {
      setIsLoading(false);
    }
  }, [caseId, navigate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleReply = (commentId: string) => {
    const comment = comments.find((c) => c.id === commentId);
    if (comment) {
      setReplyingTo({ id: commentId, name: comment.authorName });
    }
  };

  const handleCommentSubmitted = () => {
    setReplyingTo(null);
    fetchData();
  };

  const handleDeleteCase = async () => {
    if (!caseData || !isAdmin) return;

    if (!window.confirm(t('admin.confirmDeleteCase'))) return;

    setIsDeleting(true);
    try {
      // Delete images from storage
      for (const image of caseData.images) {
        try {
          const imageRef = ref(storage, image.url);
          await deleteObject(imageRef);
        } catch (e) {
          console.warn('Could not delete image:', e);
        }
      }
      // Delete the case
      await deleteCommunityCase(caseData.id);
      navigate('/community');
    } catch (error) {
      console.error('Error deleting case:', error);
      setIsDeleting(false);
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('default', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  if (isLoading) {
    return (
      <Layout>
        <Loading size="lg" text={t('common.loading')} />
      </Layout>
    );
  }

  if (!caseData) {
    return (
      <Layout>
        <Card>
          <p className="text-center text-gray-500">{t('community.caseNotFound')}</p>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Back button */}
        <Link
          to="/community"
          className="inline-flex items-center text-gray-600 hover:text-primary"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 mr-1"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
              clipRule="evenodd"
            />
          </svg>
          {t('common.back')}
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Image gallery */}
            <Card padding="none" className="overflow-hidden">
              <CaseImageGallery images={caseData.images} />
            </Card>

            {/* Description */}
            <Card>
              <h1 className="text-2xl font-bold text-charcoal mb-2">{caseData.title}</h1>

              <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                <Link
                  to={`/community/user/${caseData.authorId}`}
                  className="hover:text-primary"
                >
                  {caseData.authorName}
                </Link>
                <span>&bull;</span>
                <span>{formatDate(caseData.createdAt)}</span>
              </div>

              <p className="text-gray-700 whitespace-pre-wrap">{caseData.description}</p>

              {/* Actions */}
              {user && (
                <div className="flex items-center gap-4 mt-4 pt-4 border-t flex-wrap">
                  {/* Flag button - shown to all except author */}
                  {user.uid !== caseData.authorId && (
                    <button
                      onClick={() => setShowFlagModal(true)}
                      className="text-sm text-gray-500 hover:text-red-500 flex items-center gap-1"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {t('community.flag')}
                    </button>
                  )}

                  {/* Admin delete button */}
                  {isAdmin && (
                    <button
                      onClick={handleDeleteCase}
                      disabled={isDeleting}
                      className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1 disabled:opacity-50"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {isDeleting ? t('common.loading') : t('admin.deleteContent')}
                    </button>
                  )}
                </div>
              )}
            </Card>

            {/* Comments section */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-charcoal">
                {t('community.comments')} ({comments.length})
              </h2>

              <CommentForm
                caseId={caseData.id}
                images={caseData.images}
                parentCommentId={replyingTo?.id}
                parentAuthorName={replyingTo?.name}
                onSubmitted={handleCommentSubmitted}
                onCancelReply={() => setReplyingTo(null)}
              />

              <CommentList
                comments={comments}
                images={caseData.images}
                caseId={caseData.id}
                onReply={handleReply}
                onRefresh={fetchData}
              />
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Diagnosis */}
            {caseData.diagnosis && (
              <DiagnosisReveal caseId={caseData.id} diagnosis={caseData.diagnosis} />
            )}

            {/* Author info */}
            <Card>
              <h3 className="font-semibold text-charcoal mb-3">{t('community.author')}</h3>
              <Link
                to={`/community/user/${caseData.authorId}`}
                className="flex items-center gap-3 hover:bg-gray-50 -mx-4 px-4 py-2 rounded-lg"
              >
                <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                  <span className="text-white font-bold">
                    {caseData.authorName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-charcoal">{caseData.authorName}</p>
                  <p className="text-sm text-gray-500">{t('community.viewProfile')}</p>
                </div>
              </Link>
            </Card>

            {/* Case stats */}
            <Card>
              <h3 className="font-semibold text-charcoal mb-3">{t('community.stats')}</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('community.images')}</span>
                  <span className="text-charcoal">{caseData.images.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('community.comments')}</span>
                  <span className="text-charcoal">{comments.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('community.posted')}</span>
                  <span className="text-charcoal">
                    {new Intl.DateTimeFormat('default', {
                      day: 'numeric',
                      month: 'short',
                    }).format(caseData.createdAt)}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </div>

        <FlagContentModal
          isOpen={showFlagModal}
          onClose={() => setShowFlagModal(false)}
          contentType="case"
          contentId={caseData.id}
          caseId={caseData.id}
          onFlagged={() => {
            setShowFlagModal(false);
            navigate('/community');
          }}
        />
      </div>
    </Layout>
  );
}
