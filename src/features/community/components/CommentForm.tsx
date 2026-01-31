import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal } from '@/components/ui';
import { useAuthStore } from '@/stores';
import { createCaseComment } from '@/services/firebase/communityFirestore';
import { DrawingCanvas, DrawingToolbar } from '@/components/annotations';
import type { DrawingTool } from '@/components/annotations';
import type { CommunityCaseImage, CommentAnnotation } from '@/types';

interface CommentFormProps {
  caseId: string;
  images: CommunityCaseImage[];
  parentCommentId?: string;
  parentAuthorName?: string;
  onSubmitted: () => void;
  onCancelReply?: () => void;
}

export function CommentForm({
  caseId,
  images,
  parentCommentId,
  parentAuthorName,
  onSubmitted,
  onCancelReply,
}: CommentFormProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAnnotationEditor, setShowAnnotationEditor] = useState(false);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<CommentAnnotation[]>([]);
  const [selectedTool, setSelectedTool] = useState<DrawingTool>('arrow');
  const [selectedColor, setSelectedColor] = useState('#ef4444');

  const selectedImage = images.find((img) => img.id === selectedImageId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !text.trim()) return;

    setIsSubmitting(true);
    try {
      await createCaseComment(caseId, user.uid, user.displayName, {
        text: text.trim(),
        annotation:
          selectedImageId && annotations.length > 0
            ? { imageId: selectedImageId, drawings: annotations }
            : undefined,
        parentCommentId,
      });

      setText('');
      setAnnotations([]);
      setSelectedImageId(null);
      onSubmitted();
    } catch (error) {
      console.error('Error posting comment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenAnnotationEditor = () => {
    if (images.length > 0 && !selectedImageId) {
      setSelectedImageId(images[0].id);
    }
    setShowAnnotationEditor(true);
  };

  const handleSaveAnnotation = () => {
    setShowAnnotationEditor(false);
  };

  const handleClearAnnotation = () => {
    setAnnotations([]);
    setSelectedImageId(null);
  };

  return (
    <div className="space-y-3">
      {parentCommentId && parentAuthorName && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>{t('community.replyingTo')} @{parentAuthorName}</span>
          <button
            onClick={onCancelReply}
            className="text-primary hover:underline"
          >
            {t('common.cancel')}
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('community.writeComment')}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
          rows={3}
        />

        {/* Annotation preview */}
        {selectedImageId && annotations.length > 0 && (
          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-primary"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" />
            </svg>
            <span className="text-sm text-gray-600">
              {t('community.annotationAdded', { count: annotations.length })}
            </span>
            <button
              type="button"
              onClick={handleOpenAnnotationEditor}
              className="text-sm text-primary hover:underline"
            >
              {t('common.edit')}
            </button>
            <button
              type="button"
              onClick={handleClearAnnotation}
              className="text-sm text-red-500 hover:underline"
            >
              {t('common.delete')}
            </button>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {images.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenAnnotationEditor}
              >
                {t('community.addAnnotation')}
              </Button>
            )}
          </div>

          <Button
            type="submit"
            disabled={!text.trim() || isSubmitting}
            isLoading={isSubmitting}
          >
            {t('community.postComment')}
          </Button>
        </div>
      </form>

      {/* Annotation Editor Modal */}
      <Modal
        isOpen={showAnnotationEditor}
        onClose={() => setShowAnnotationEditor(false)}
        title={t('community.annotateImage')}
        size="lg"
      >
        <div className="space-y-4">
          {/* Image selector */}
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {images.map((image) => (
                <button
                  key={image.id}
                  onClick={() => {
                    setSelectedImageId(image.id);
                    setAnnotations([]);
                  }}
                  className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${
                    selectedImageId === image.id ? 'border-primary' : 'border-transparent'
                  }`}
                >
                  <img
                    src={image.url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}

          {/* Drawing toolbar */}
          <DrawingToolbar
            selectedTool={selectedTool}
            selectedColor={selectedColor}
            onToolChange={setSelectedTool}
            onColorChange={setSelectedColor}
          />

          {/* Drawing canvas */}
          {selectedImage && (
            <DrawingCanvas
              imageUrl={selectedImage.url}
              annotations={annotations}
              onAnnotationsChange={setAnnotations}
              selectedTool={selectedTool}
              selectedColor={selectedColor}
            />
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => setShowAnnotationEditor(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSaveAnnotation}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
