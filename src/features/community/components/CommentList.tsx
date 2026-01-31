import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { Card, Modal } from '@/components/ui';
import { useAuthStore } from '@/stores';
import type { CaseComment, CommunityCaseImage, CommentAnnotation } from '@/types';
import { DrawingCanvas } from '@/components/annotations';
import { FlagContentModal } from './FlagContentModal';
import { deleteCaseComment } from '@/services/firebase/communityFirestore';

interface CommentListProps {
  comments: CaseComment[];
  images: CommunityCaseImage[];
  caseId: string;
  onReply: (commentId: string) => void;
  onRefresh: () => void;
}

export function CommentList({
  comments,
  images,
  caseId,
  onReply,
  onRefresh,
}: CommentListProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [expandedAnnotations, setExpandedAnnotations] = useState<Set<string>>(new Set());
  const [flaggingCommentId, setFlaggingCommentId] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [fullscreenAnnotation, setFullscreenAnnotation] = useState<{
    imageUrl: string;
    drawings: CommentAnnotation[];
  } | null>(null);

  const isAdmin = user?.role === 'admin';

  const handleDeleteComment = async (commentId: string) => {
    if (!isAdmin) return;

    if (!window.confirm(t('admin.confirmDeleteComment'))) return;

    setDeletingCommentId(commentId);
    try {
      await deleteCaseComment(caseId, commentId);
      onRefresh();
    } catch (error) {
      console.error('Error deleting comment:', error);
    } finally {
      setDeletingCommentId(null);
    }
  };

  // Organize comments into threads
  const topLevelComments = comments.filter((c) => !c.parentCommentId);
  const getReplies = (commentId: string) =>
    comments.filter((c) => c.parentCommentId === commentId);

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('default', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const toggleAnnotation = (commentId: string) => {
    setExpandedAnnotations((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(commentId)) {
        newSet.delete(commentId);
      } else {
        newSet.add(commentId);
      }
      return newSet;
    });
  };

  const getImageForAnnotation = (imageId: string) => {
    return images.find((img) => img.id === imageId);
  };

  const renderComment = (comment: CaseComment, isReply = false) => {
    const annotationImage = comment.annotation
      ? getImageForAnnotation(comment.annotation.imageId)
      : null;

    return (
      <div
        key={comment.id}
        className={`${isReply ? 'ml-8 border-l-2 border-gray-200 pl-4' : ''}`}
        data-testid="comment-item"
      >
        <Card padding="sm" className="mb-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">
                {comment.authorName.charAt(0).toUpperCase()}
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-charcoal">{comment.authorName}</span>
                <span className="text-xs text-gray-500">{formatDate(comment.createdAt)}</span>
              </div>

              {comment.parentCommentId && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {t('community.replyingTo')} @
                  {comments.find((c) => c.id === comment.parentCommentId)?.authorName}
                </p>
              )}

              <p className="text-gray-700 mt-2 whitespace-pre-wrap">{comment.text}</p>

              {/* Annotation preview */}
              {comment.annotation && annotationImage && Array.isArray(comment.annotation.drawings) && comment.annotation.drawings.length > 0 && (
                <div className="mt-3">
                  <button
                    onClick={() => toggleAnnotation(comment.id)}
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" />
                    </svg>
                    {expandedAnnotations.has(comment.id)
                      ? t('community.hideAnnotation')
                      : t('community.showAnnotation')}
                  </button>

                  {expandedAnnotations.has(comment.id) && (
                    <div
                      className="mt-2 rounded-lg overflow-hidden max-w-lg cursor-pointer"
                      onClick={() =>
                        setFullscreenAnnotation({
                          imageUrl: annotationImage.url,
                          drawings: comment.annotation!.drawings,
                        })
                      }
                    >
                      <DrawingCanvas
                        imageUrl={annotationImage.url}
                        annotations={comment.annotation.drawings}
                        onAnnotationsChange={() => {}}
                        readOnly
                      />
                      <p className="text-xs text-gray-500 mt-1 text-center">
                        {t('community.clickToEnlarge')}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-4 mt-3">
                <button
                  onClick={() => onReply(comment.id)}
                  className="text-sm text-gray-500 hover:text-primary flex items-center gap-1"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {t('community.reply')}
                </button>

                {user && user.uid !== comment.authorId && (
                  <button
                    onClick={() => setFlaggingCommentId(comment.id)}
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

                {isAdmin && (
                  <button
                    onClick={() => handleDeleteComment(comment.id)}
                    disabled={deletingCommentId === comment.id}
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
                    {deletingCommentId === comment.id ? t('common.loading') : t('admin.delete')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Render replies */}
        {getReplies(comment.id).map((reply) => renderComment(reply, true))}
      </div>
    );
  };

  if (comments.length === 0) {
    return (
      <Card>
        <p className="text-center text-gray-500 py-8">{t('community.noComments')}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {topLevelComments.map((comment) => renderComment(comment))}

      <FlagContentModal
        isOpen={flaggingCommentId !== null}
        onClose={() => setFlaggingCommentId(null)}
        contentType="comment"
        contentId={flaggingCommentId || ''}
        caseId={caseId}
        onFlagged={() => {
          setFlaggingCommentId(null);
          onRefresh();
        }}
      />

      {/* Fullscreen annotation modal */}
      <Modal
        isOpen={fullscreenAnnotation !== null}
        onClose={() => setFullscreenAnnotation(null)}
        title=""
        size="full"
      >
        {fullscreenAnnotation && (
          <div className="relative bg-black rounded-lg">
            <TransformWrapper
              initialScale={1}
              minScale={0.5}
              maxScale={5}
              centerOnInit
              wheel={{ step: 0.1 }}
              pinch={{ step: 5 }}
            >
              {({ zoomIn, zoomOut, resetTransform }) => (
                <>
                  <TransformComponent
                    wrapperStyle={{ width: '100%', height: '100%' }}
                    contentStyle={{ width: '100%', height: '100%' }}
                  >
                    <div className="flex items-center justify-center">
                      <DrawingCanvas
                        imageUrl={fullscreenAnnotation.imageUrl}
                        annotations={fullscreenAnnotation.drawings}
                        onAnnotationsChange={() => {}}
                        readOnly
                      />
                    </div>
                  </TransformComponent>

                  {/* Zoom controls */}
                  <div className="absolute bottom-4 left-4 flex gap-2 z-10">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        zoomOut();
                      }}
                      className="p-2 bg-white bg-opacity-90 rounded-lg shadow hover:bg-opacity-100 transition-colors"
                      aria-label="Zoom out"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        zoomIn();
                      }}
                      className="p-2 bg-white bg-opacity-90 rounded-lg shadow hover:bg-opacity-100 transition-colors"
                      aria-label="Zoom in"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        resetTransform();
                      }}
                      className="p-2 bg-white bg-opacity-90 rounded-lg shadow hover:bg-opacity-100 transition-colors"
                      aria-label="Reset zoom"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                        />
                      </svg>
                    </button>
                  </div>
                </>
              )}
            </TransformWrapper>
          </div>
        )}
      </Modal>
    </div>
  );
}
