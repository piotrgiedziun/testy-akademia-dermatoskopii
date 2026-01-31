import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
import type { Case, Test, TestAnswer } from '@/types';

export function CasesAdmin() {
  const { t, i18n } = useTranslation();
  const [cases, setCases] = useState<Case[]>([]);
  const [tests, setTests] = useState<Test[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCase, setEditingCase] = useState<Case | null>(null);
  const [uploading, setUploading] = useState(false);
  const [filterTestId, setFilterTestId] = useState<string>('');

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
      const storageRef = ref(storage, `cases/${Date.now()}_${file.name}`);
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
      annotations: editingCase?.annotations || null,
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
                  className="w-20 h-20 object-cover rounded-lg"
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
        onClose={() => setIsModalOpen(false)}
        title={editingCase ? t('admin.edit') : t('admin.add')}
        size="xl"
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
                  className="w-full h-32 object-cover rounded-lg"
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
                  className="w-full h-32 object-cover rounded-lg"
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

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={() => setIsModalOpen(false)}
            >
              {t('admin.cancel')}
            </Button>
            <Button type="submit" fullWidth isLoading={uploading}>
              {t('admin.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
