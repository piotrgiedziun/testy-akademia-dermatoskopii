import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Layout } from '@/components/layout';
import { Button, Card, Input, Loading } from '@/components/ui';
import { useAuthStore } from '@/stores';
import {
  getCommunityCase,
  updateCommunityCase,
} from '@/services/firebase/communityFirestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/services/firebase/config';
import type { CommunityCaseImage, CommunityCase } from '@/types';

interface ImageUpload {
  id: string;
  file?: File;
  preview: string;
  type: 'dermatoscopic' | 'macro' | 'other';
  uploading: boolean;
  url?: string;
  isExisting: boolean;
}

export function EditCasePage() {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [caseData, setCaseData] = useState<CommunityCase | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<ImageUpload[]>([]);
  const [includeDiagnosis, setIncludeDiagnosis] = useState(false);
  const [diagnosisText, setDiagnosisText] = useState('');
  const [histopathology, setHistopathology] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCase = async () => {
      if (!caseId) return;

      try {
        const result = await getCommunityCase(caseId);
        if (!result) {
          navigate('/community');
          return;
        }

        // Check if user is the author
        if (user?.uid !== result.authorId) {
          navigate(`/community/case/${caseId}`);
          return;
        }

        setCaseData(result);
        setTitle(result.title);
        setDescription(result.description);

        // Convert existing images to ImageUpload format
        const existingImages: ImageUpload[] = result.images.map((img) => ({
          id: img.id,
          preview: img.url,
          type: img.type,
          uploading: false,
          url: img.url,
          isExisting: true,
        }));
        setImages(existingImages);

        // Set diagnosis if exists
        if (result.diagnosis) {
          setIncludeDiagnosis(true);
          setDiagnosisText(result.diagnosis.text);
          setHistopathology(result.diagnosis.histopathologyResult || '');
        }
      } catch (error) {
        console.error('Error fetching case:', error);
        navigate('/community');
      } finally {
        setIsLoading(false);
      }
    };

    fetchCase();
  }, [caseId, navigate, user?.uid]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newImages: ImageUpload[] = Array.from(files).map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      preview: URL.createObjectURL(file),
      type: 'dermatoscopic',
      uploading: false,
      isExisting: false,
    }));

    setImages((prev) => [...prev, ...newImages]);
  };

  const handleRemoveImage = (id: string) => {
    setImages((prev) => {
      const image = prev.find((img) => img.id === id);
      if (image && !image.isExisting) {
        URL.revokeObjectURL(image.preview);
      }
      return prev.filter((img) => img.id !== id);
    });
  };

  const handleImageTypeChange = (id: string, type: ImageUpload['type']) => {
    setImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, type } : img))
    );
  };

  const uploadImage = async (image: ImageUpload): Promise<string> => {
    if (!image.file) throw new Error('No file to upload');

    const timestamp = Date.now();
    const ext = image.file.name.split('.').pop();
    const filename = `community/${user!.uid}/${timestamp}-${image.id}.${ext}`;
    const storageRef = ref(storage, filename);

    await uploadBytes(storageRef, image.file);
    return getDownloadURL(storageRef);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !caseId) return;

    if (!title.trim()) {
      setError(t('community.errors.titleRequired'));
      return;
    }

    if (!description.trim()) {
      setError(t('community.errors.descriptionRequired'));
      return;
    }

    if (images.length === 0) {
      setError(t('community.errors.imageRequired'));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Process images - upload new ones, keep existing URLs
      const processedImages: CommunityCaseImage[] = await Promise.all(
        images.map(async (img, index) => {
          let url = img.url;

          // Upload new images
          if (!img.isExisting && img.file) {
            url = await uploadImage(img);
          }

          return {
            id: img.id,
            url: url!,
            type: img.type,
            order: index,
          };
        })
      );

      // Build diagnosis object only if diagnosis is included
      const diagnosisData = includeDiagnosis && diagnosisText.trim()
        ? {
            text: diagnosisText.trim(),
            ...(histopathology.trim() ? { histopathologyResult: histopathology.trim() } : {}),
          }
        : undefined;

      // Update case
      await updateCommunityCase(caseId, {
        title: title.trim(),
        description: description.trim(),
        images: processedImages,
        ...(diagnosisData ? { diagnosis: diagnosisData } : {}),
      });

      navigate(`/community/case/${caseId}`);
    } catch (error) {
      console.error('Error updating case:', error);
      setError(t('common.error'));
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

  if (!caseData) {
    return (
      <Layout>
        <Card>
          <p className="text-center text-gray-500">
            {t('community.caseNotFound')}
          </p>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            to={`/community/case/${caseId}`}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
                clipRule="evenodd"
              />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold text-charcoal">
            {t('community.editCase')}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic info */}
          <Card>
            <div className="space-y-4">
              <Input
                label={t('community.caseTitle')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('community.caseTitlePlaceholder')}
                required
              />

              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">
                  {t('community.caseDescription')}
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('community.caseDescriptionPlaceholder')}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                  rows={4}
                  required
                />
              </div>
            </div>
          </Card>

          {/* Images */}
          <Card>
            <h2 className="font-semibold text-charcoal mb-4">
              {t('community.images')}
            </h2>

            {/* Image upload area */}
            <label className="block border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors mb-4">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageSelect}
                className="hidden"
              />
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-10 w-10 text-gray-400 mx-auto mb-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <p className="text-gray-600">{t('community.dropImages')}</p>
              <p className="text-sm text-gray-500 mt-1">
                {t('community.imageTypes')}
              </p>
            </label>

            {/* Image previews */}
            {images.length > 0 && (
              <div className="space-y-3">
                {images.map((image, index) => (
                  <div
                    key={image.id}
                    className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg"
                  >
                    <img
                      src={image.preview}
                      alt={`Preview ${index + 1}`}
                      className="w-16 h-16 object-cover rounded-lg"
                    />

                    <div className="flex-1">
                      <select
                        value={image.type}
                        onChange={(e) =>
                          handleImageTypeChange(
                            image.id,
                            e.target.value as ImageUpload['type']
                          )
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      >
                        <option value="dermatoscopic">
                          {t('community.dermatoscopic')}
                        </option>
                        <option value="macro">{t('community.macro')}</option>
                        <option value="other">{t('community.other')}</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveImage(image.id)}
                      className="p-2 text-gray-500 hover:text-red-500"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Diagnosis (optional) */}
          <Card>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includeDiagnosis}
                onChange={(e) => setIncludeDiagnosis(e.target.checked)}
                className="w-5 h-5 rounded text-primary focus:ring-primary"
              />
              <span className="font-semibold text-charcoal">
                {t('community.includeDiagnosis')}
              </span>
            </label>

            {includeDiagnosis && (
              <div className="mt-4 space-y-4 pl-8">
                <Input
                  label={t('community.diagnosisText')}
                  value={diagnosisText}
                  onChange={(e) => setDiagnosisText(e.target.value)}
                  placeholder={t('community.diagnosisPlaceholder')}
                />

                <Input
                  label={`${t('community.histopathology')} (${t('common.optional')})`}
                  value={histopathology}
                  onChange={(e) => setHistopathology(e.target.value)}
                  placeholder={t('community.histopathologyPlaceholder')}
                />

                <p className="text-sm text-gray-500">
                  {t('community.diagnosisNote')}
                </p>
              </div>
            )}
          </Card>

          {/* Error message */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
              {error}
            </div>
          )}

          {/* Submit */}
          <div className="flex gap-4">
            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={() => navigate(`/community/case/${caseId}`)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              fullWidth
              disabled={isSubmitting}
              isLoading={isSubmitting}
            >
              {t('community.updateCase')}
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
