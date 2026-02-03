import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { Card, Button, Input, Modal, Loading } from '@/components/ui';
import { db, storage } from '@/services/firebase/config';
import {
  doc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  orderBy,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { DrawingCanvas, DrawingToolbar } from '@/components/annotations';
import type { DrawingTool } from '@/components/annotations';
import type { Annotation, Case, Test, TestAnswer, CommentAnnotation } from '@/types';

export function CasesAdmin() {
  const { t, i18n } = useTranslation();
  const [cases, setCases] = useState<Case[]>([]);
  const [tests, setTests] = useState<Test[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCase, setEditingCase] = useState<Case | null>(null);
  const [uploading, setUploading] = useState(false);
  const [filterTestId, setFilterTestId] = useState<string>('');
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);

  // Annotation state - using CommentAnnotation for drawing, convert to Annotation when saving
  const [drawingAnnotations, setDrawingAnnotations] = useState<CommentAnnotation[]>([]);
  const [showAnnotationEditor, setShowAnnotationEditor] = useState(false);
  const [selectedTool, setSelectedTool] = useState<DrawingTool>('arrow');
  const [selectedColor, setSelectedColor] = useState('#ef4444');

  const [formData, setFormData] = useState({
    testId: '',
    order: 1,
    polarizedUrl: '',
    nonPolarizedUrl: '',
    correctAnswers: [] as string[],
    explanationPl: '',
    explanationEn: '',
    featuresPl: '',
    featuresEn: '',
    differentialsPl: '',
    differentialsEn: '',
    pitfallPl: '',
    pitfallEn: '',
  });

  const fetchData = async () => {
    try {
      const [casesSnapshot, testsSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'cases'), orderBy('order'))),
        getDocs(query(collection(db, 'tests'), orderBy('order'))),
      ]);
      setCases(
        casesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Case[]
      );
      const testsData = testsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Test[];
      setTests(testsData);
      // Set default filter to first test
      if (testsData.length > 0 && !filterTestId) {
        setFilterTestId(testsData[0].id);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getLocalizedText = (text: { pl: string; en: string }) => {
    return i18n.language === 'pl' ? text.pl : text.en;
  };

  const getTestTitle = (testId: string) => {
    const test = tests.find((t) => t.id === testId);
    return test ? getLocalizedText(test.title) : testId;
  };

  const getTestAnswers = (testId: string): TestAnswer[] => {
    const test = tests.find((t) => t.id === testId);
    return test?.answers || [];
  };

  const getAnswerName = (testId: string, answerId: string) => {
    const answers = getTestAnswers(testId);
    const answer = answers.find((a) => a.id === answerId);
    return answer ? getLocalizedText(answer.name) : answerId;
  };

  const filteredCases = useMemo(() => {
    if (!filterTestId) return [];
    return cases.filter((c) => c.testId === filterTestId);
  }, [cases, filterTestId]);

  const currentFormAnswers = useMemo(() => {
    return getTestAnswers(formData.testId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.testId, tests]);

  const handleImageUpload = async (
    file: File,
    field: 'polarizedUrl' | 'nonPolarizedUrl'
  ) => {
    setUploading(true);
    try {
      const extension = file.name.split('.').pop() || 'jpg';
      const uuid = crypto.randomUUID();
      const storageRef = ref(storage, `cases/${uuid}.${extension}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setFormData({ ...formData, [field]: url });
    } catch (error) {
      console.error('Error uploading image:', error);
    } finally {
      setUploading(false);
    }
  };

  const openModal = (caseItem?: Case) => {
    if (caseItem) {
      setEditingCase(caseItem);
      const polarized = caseItem.images.find((i) => i.type === 'polarized');
      const nonPolarized = caseItem.images.find((i) => i.type === 'non-polarized');
      setFormData({
        testId: caseItem.testId,
        order: caseItem.order,
        polarizedUrl: polarized?.url || '',
        nonPolarizedUrl: nonPolarized?.url || '',
        correctAnswers: caseItem.correctAnswers,
        explanationPl: caseItem.explanation.pl,
        explanationEn: caseItem.explanation.en,
        featuresPl: caseItem.features.map((f) => f.pl).join('\n'),
        featuresEn: caseItem.features.map((f) => f.en).join('\n'),
        differentialsPl: caseItem.differentials.map((d) => d.pl).join('\n'),
        differentialsEn: caseItem.differentials.map((d) => d.en).join('\n'),
        pitfallPl: caseItem.pitfall?.pl || '',
        pitfallEn: caseItem.pitfall?.en || '',
      });
      // Convert Annotation[] to CommentAnnotation[] for the drawing canvas
      const drawings: CommentAnnotation[] = (caseItem.annotations || []).map((ann) => ({
        type: ann.type === 'rect' ? 'area' : ann.type,
        coords: {
          x: ann.coords.x,
          y: ann.coords.y,
          endX: ann.coords.endX,
          endY: ann.coords.endY,
          radius: ann.coords.radius,
          points: ann.type === 'rect' ? [
            { x: ann.coords.x, y: ann.coords.y },
            { x: ann.coords.x + (ann.coords.width || 0), y: ann.coords.y },
            { x: ann.coords.x + (ann.coords.width || 0), y: ann.coords.y + (ann.coords.height || 0) },
            { x: ann.coords.x, y: ann.coords.y + (ann.coords.height || 0) },
          ] : undefined,
        },
        color: ann.color || '#ef4444',  // Use saved color or fallback for legacy data
        strokeStyle: 'dashed',
      }));
      setDrawingAnnotations(drawings);
    } else {
      setEditingCase(null);
      setFormData({
        testId: filterTestId || tests[0]?.id || '',
        order: cases.length + 1,
        polarizedUrl: '',
        nonPolarizedUrl: '',
        correctAnswers: [],
        explanationPl: '',
        explanationEn: '',
        featuresPl: '',
        featuresEn: '',
        differentialsPl: '',
        differentialsEn: '',
        pitfallPl: '',
        pitfallEn: '',
      });
      setDrawingAnnotations([]);
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const images = [];
    if (formData.polarizedUrl) {
      images.push({ url: formData.polarizedUrl, type: 'polarized' as const });
    }
    if (formData.nonPolarizedUrl) {
      images.push({ url: formData.nonPolarizedUrl, type: 'non-polarized' as const });
    }

    const featuresPl = formData.featuresPl.split('\n').filter((f) => f.trim());
    const featuresEn = formData.featuresEn.split('\n').filter((f) => f.trim());
    const features = featuresPl.map((pl, i) => ({
      pl,
      en: featuresEn[i] || pl,
    }));

    const differentialsPl = formData.differentialsPl
      .split('\n')
      .filter((d) => d.trim());
    const differentialsEn = formData.differentialsEn
      .split('\n')
      .filter((d) => d.trim());
    const differentials = differentialsPl.map((pl, i) => ({
      pl,
      en: differentialsEn[i] || pl,
    }));

    const caseData = {
      testId: formData.testId,
      order: formData.order,
      images,
      correctAnswers: formData.correctAnswers,
      explanation: { pl: formData.explanationPl, en: formData.explanationEn },
      features,
      differentials,
      pitfall:
        formData.pitfallPl || formData.pitfallEn
          ? { pl: formData.pitfallPl, en: formData.pitfallEn }
          : null,
      // Convert CommentAnnotation[] back to Annotation[] format
      // Filter out undefined values as Firestore doesn't accept them
      annotations: drawingAnnotations.length > 0
        ? drawingAnnotations.map((drawing): Annotation => {
            const coords: Annotation['coords'] = {
              x: drawing.coords.x,
              y: drawing.coords.y,
            };
            if (drawing.coords.endX !== undefined) coords.endX = drawing.coords.endX;
            if (drawing.coords.endY !== undefined) coords.endY = drawing.coords.endY;
            if (drawing.coords.radius !== undefined) coords.radius = drawing.coords.radius;

            // For 'area' type (rectangles), calculate width and height from points array
            if (drawing.type === 'area' && drawing.coords.points && drawing.coords.points.length >= 3) {
              const points = drawing.coords.points;
              const width = Math.abs(points[1].x - points[0].x);
              const height = Math.abs(points[2].y - points[0].y);
              coords.width = width;
              coords.height = height;
            }

            return {
              type: drawing.type === 'area' ? 'rect' : drawing.type as 'circle' | 'arrow',
              coords,
              label: { pl: '', en: '' },
              color: drawing.color,  // Preserve the color when saving
            };
          })
        : null,
    };

    try {
      if (editingCase) {
        await setDoc(doc(db, 'cases', editingCase.id), caseData);
      } else {
        const newDocRef = doc(collection(db, 'cases'));
        await setDoc(newDocRef, caseData);
      }
      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error saving case:', error);
    }
  };

  const handleDelete = async (caseId: string) => {
    if (!confirm(t('admin.confirmDelete'))) return;

    try {
      await deleteDoc(doc(db, 'cases', caseId));
      fetchData();
    } catch (error) {
      console.error('Error deleting case:', error);
    }
  };

  const toggleAnswer = (answerId: string) => {
    if (formData.correctAnswers.includes(answerId)) {
      setFormData({
        ...formData,
        correctAnswers: formData.correctAnswers.filter((a) => a !== answerId),
      });
    } else {
      setFormData({
        ...formData,
        correctAnswers: [...formData.correctAnswers, answerId],
      });
    }
  };

  const handleTestChange = (newTestId: string) => {
    setFormData({
      ...formData,
      testId: newTestId,
      correctAnswers: [], // Reset answers when test changes
    });
  };

  const handleCloseModal = () => {
    if (confirm(t('admin.confirmCloseModal'))) {
      setIsModalOpen(false);
    }
  };

  if (isLoading) {
    return <Loading size="lg" text={t('common.loading')} />;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-charcoal">{t('admin.cases')}</h1>
        <Button onClick={() => openModal()}>{t('admin.add')}</Button>
      </div>

      {/* Test filter */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-charcoal mb-1">
          Filter by Test
        </label>
        <select
          className="w-full md:w-64 px-4 py-2 rounded-lg border border-blue-gray"
          value={filterTestId}
          onChange={(e) => setFilterTestId(e.target.value)}
        >
          {tests.map((test) => (
            <option key={test.id} value={test.id}>
              {getLocalizedText(test.title)}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-4">
        {filteredCases.map((caseItem) => (
          <Card key={caseItem.id}>
            <div className="flex items-start gap-4">
              {caseItem.images[0] && (
                <img
                  src={caseItem.images[0].url}
                  alt=""
                  className="w-32 h-32 object-contain bg-gray-100 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setZoomImageUrl(caseItem.images[0].url)}
                />
              )}
              <div className="flex-1">
                <p className="text-xs text-gray-400 mb-1">
                  {getTestTitle(caseItem.testId)} · Case #{caseItem.order}
                </p>
                <p className="font-medium">
                  {caseItem.correctAnswers.map((id) => getAnswerName(caseItem.testId, id)).join(', ')}
                </p>
                <p className="text-sm text-gray-500 line-clamp-2">
                  {getLocalizedText(caseItem.explanation)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openModal(caseItem)}
                >
                  {t('admin.edit')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500"
                  onClick={() => handleDelete(caseItem.id)}
                >
                  {t('admin.delete')}
                </Button>
              </div>
            </div>
          </Card>
        ))}

        {filteredCases.length === 0 && (
          <Card>
            <p className="text-center text-gray-500">{t('common.noResults')}</p>
          </Card>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingCase ? t('admin.edit') : t('admin.add')}
        size="6xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">
                Test
              </label>
              <select
                className="w-full px-4 py-3 rounded-lg border border-blue-gray"
                value={formData.testId}
                onChange={(e) => handleTestChange(e.target.value)}
                required
              >
                {tests.map((test) => (
                  <option key={test.id} value={test.id}>
                    {getLocalizedText(test.title)}
                  </option>
                ))}
              </select>
            </div>
            <Input
              type="number"
              label="Order"
              value={formData.order}
              onChange={(e) =>
                setFormData({ ...formData, order: parseInt(e.target.value) })
              }
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">
                Polarized Image
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file, 'polarizedUrl');
                }}
                className="mb-2"
              />
              {formData.polarizedUrl && (
                <img
                  src={formData.polarizedUrl}
                  alt="Polarized"
                  className="w-full h-48 object-contain bg-gray-100 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setZoomImageUrl(formData.polarizedUrl)}
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">
                Non-polarized Image
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file, 'nonPolarizedUrl');
                }}
                className="mb-2"
              />
              {formData.nonPolarizedUrl && (
                <img
                  src={formData.nonPolarizedUrl}
                  alt="Non-polarized"
                  className="w-full h-48 object-contain bg-gray-100 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setZoomImageUrl(formData.nonPolarizedUrl)}
                />
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-2">
              Correct Answers
            </label>
            {currentFormAnswers.length === 0 ? (
              <p className="text-sm text-gray-500 italic p-3 border rounded-lg">
                No answers defined for this test. Please add answers in the Tests admin first.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border rounded-lg p-3">
                {currentFormAnswers.map((answer) => (
                  <label key={answer.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.correctAnswers.includes(answer.id)}
                      onChange={() => toggleAnswer(answer.id)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">{getLocalizedText(answer.name)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">
                Explanation (PL)
              </label>
              <textarea
                className="w-full px-4 py-3 rounded-lg border border-blue-gray"
                rows={3}
                value={formData.explanationPl}
                onChange={(e) =>
                  setFormData({ ...formData, explanationPl: e.target.value })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">
                Explanation (EN)
              </label>
              <textarea
                className="w-full px-4 py-3 rounded-lg border border-blue-gray"
                rows={3}
                value={formData.explanationEn}
                onChange={(e) =>
                  setFormData({ ...formData, explanationEn: e.target.value })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">
                Features (PL) - one per line
              </label>
              <textarea
                className="w-full px-4 py-3 rounded-lg border border-blue-gray"
                rows={3}
                value={formData.featuresPl}
                onChange={(e) =>
                  setFormData({ ...formData, featuresPl: e.target.value })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">
                Features (EN) - one per line
              </label>
              <textarea
                className="w-full px-4 py-3 rounded-lg border border-blue-gray"
                rows={3}
                value={formData.featuresEn}
                onChange={(e) =>
                  setFormData({ ...formData, featuresEn: e.target.value })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">
                Differentials (PL) - one per line
              </label>
              <textarea
                className="w-full px-4 py-3 rounded-lg border border-blue-gray"
                rows={2}
                value={formData.differentialsPl}
                onChange={(e) =>
                  setFormData({ ...formData, differentialsPl: e.target.value })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">
                Differentials (EN) - one per line
              </label>
              <textarea
                className="w-full px-4 py-3 rounded-lg border border-blue-gray"
                rows={2}
                value={formData.differentialsEn}
                onChange={(e) =>
                  setFormData({ ...formData, differentialsEn: e.target.value })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Pitfall (PL)"
              value={formData.pitfallPl}
              onChange={(e) =>
                setFormData({ ...formData, pitfallPl: e.target.value })
              }
            />
            <Input
              label="Pitfall (EN)"
              value={formData.pitfallEn}
              onChange={(e) =>
                setFormData({ ...formData, pitfallEn: e.target.value })
              }
            />
          </div>

          {/* Annotations Section */}
          <div className="border-t pt-4">
            <h3 className="text-lg font-medium text-charcoal mb-2">
              {t('admin.annotations')}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {t('admin.annotationsDescription')}
            </p>

            {(formData.polarizedUrl || formData.nonPolarizedUrl) ? (
              <div className="space-y-3">
                {/* Annotation preview */}
                {drawingAnnotations.length > 0 && (
                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                    <svg className="h-5 w-5 text-primary" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" />
                    </svg>
                    <span className="text-sm text-gray-600">
                      {drawingAnnotations.length} annotation(s)
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAnnotationEditor(true)}
                      className="text-sm text-primary hover:underline"
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDrawingAnnotations([])}
                      className="text-sm text-red-500 hover:underline"
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                )}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAnnotationEditor(true)}
                >
                  {drawingAnnotations.length > 0 ? t('common.edit') : t('community.addAnnotation')}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic p-4 border rounded-lg text-center">
                {t('admin.selectImage')}
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={handleCloseModal}
            >
              {t('admin.cancel')}
            </Button>
            <Button type="submit" fullWidth isLoading={uploading}>
              {t('admin.save')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Image Zoom Modal */}
      <Modal
        isOpen={!!zoomImageUrl}
        onClose={() => setZoomImageUrl(null)}
        title={t('admin.imagePreview')}
        size="6xl"
      >
        {zoomImageUrl && (
          <div className="relative bg-black rounded-lg overflow-hidden">
            <TransformWrapper
              initialScale={1}
              minScale={0.5}
              maxScale={5}
              centerOnInit
              wheel={{ step: 0.1 }}
            >
              {({ zoomIn, zoomOut, resetTransform }) => (
                <>
                  <TransformComponent
                    wrapperStyle={{ width: '100%', height: '100%' }}
                    contentStyle={{ width: '100%', height: '100%' }}
                  >
                    <div className="flex items-center justify-center min-h-[60vh]">
                      <img
                        src={zoomImageUrl}
                        alt=""
                        className="max-w-full max-h-[70vh] object-contain"
                        draggable={false}
                      />
                    </div>
                  </TransformComponent>

                  <div className="absolute bottom-4 left-4 flex gap-2">
                    <button
                      onClick={() => zoomOut()}
                      className="p-2 bg-white bg-opacity-90 rounded-lg shadow hover:bg-opacity-100 transition-colors"
                      aria-label="Zoom out"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                      </svg>
                    </button>
                    <button
                      onClick={() => zoomIn()}
                      className="p-2 bg-white bg-opacity-90 rounded-lg shadow hover:bg-opacity-100 transition-colors"
                      aria-label="Zoom in"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                    <button
                      onClick={() => resetTransform()}
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

      {/* Annotation Editor Modal */}
      <Modal
        isOpen={showAnnotationEditor}
        onClose={() => setShowAnnotationEditor(false)}
        title={t('community.annotateImage')}
        size="lg"
      >
        <div className="space-y-4">
          {/* Drawing toolbar */}
          <DrawingToolbar
            selectedTool={selectedTool}
            selectedColor={selectedColor}
            onToolChange={setSelectedTool}
            onColorChange={setSelectedColor}
          />

          {/* Drawing canvas */}
          {(formData.polarizedUrl || formData.nonPolarizedUrl) && (
            <DrawingCanvas
              imageUrl={formData.polarizedUrl || formData.nonPolarizedUrl}
              annotations={drawingAnnotations}
              onAnnotationsChange={setDrawingAnnotations}
              selectedTool={selectedTool}
              selectedColor={selectedColor}
            />
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => setShowAnnotationEditor(false)}
            >
              {t('common.close')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
