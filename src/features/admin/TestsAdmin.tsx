import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Button, Input, Modal, Loading } from '@/components/ui';
import { getLevels } from '@/services/firebase/firestore';
import { db } from '@/services/firebase/config';
import {
  doc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  orderBy,
} from 'firebase/firestore';
import type { Test, Level, TestAnswer } from '@/types';

export function TestsAdmin() {
  const { t, i18n } = useTranslation();
  const [tests, setTests] = useState<Test[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTest, setEditingTest] = useState<Test | null>(null);
  const [formData, setFormData] = useState({
    levelId: '',
    order: 1,
    titlePl: '',
    titleEn: '',
    timerMode: 'none' as 'countdown' | 'stopwatch' | 'none',
    timePerQuestion: 30,
    pointsPerCorrect: 10,
    answerType: 'single' as 'single' | 'multiple',
    answers: [] as TestAnswer[],
  });

  const [newAnswerPl, setNewAnswerPl] = useState('');
  const [newAnswerEn, setNewAnswerEn] = useState('');

  const fetchData = async () => {
    try {
      const [levelsData, testsSnapshot] = await Promise.all([
        getLevels(),
        getDocs(query(collection(db, 'tests'), orderBy('order'))),
      ]);
      setLevels(levelsData);
      setTests(
        testsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Test[]
      );
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getLocalizedText = (text: { pl: string; en: string }) => {
    return i18n.language === 'pl' ? text.pl : text.en;
  };

  const getLevelTitle = (levelId: string) => {
    const level = levels.find((l) => l.id === levelId);
    return level ? getLocalizedText(level.title) : levelId;
  };

  const openModal = (test?: Test) => {
    if (test) {
      setEditingTest(test);
      setFormData({
        levelId: test.levelId,
        order: test.order,
        titlePl: test.title.pl,
        titleEn: test.title.en,
        timerMode: test.timerMode,
        timePerQuestion: test.timePerQuestion,
        pointsPerCorrect: test.pointsPerCorrect,
        answerType: test.answerType,
        answers: test.answers || [],
      });
    } else {
      setEditingTest(null);
      setFormData({
        levelId: levels[0]?.id || '',
        order: tests.length + 1,
        titlePl: '',
        titleEn: '',
        timerMode: 'none',
        timePerQuestion: 30,
        pointsPerCorrect: 10,
        answerType: 'single',
        answers: [],
      });
    }
    setNewAnswerPl('');
    setNewAnswerEn('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const testData = {
      levelId: formData.levelId,
      order: formData.order,
      title: { pl: formData.titlePl, en: formData.titleEn },
      timerMode: formData.timerMode,
      timePerQuestion: formData.timePerQuestion,
      pointsPerCorrect: formData.pointsPerCorrect,
      answerType: formData.answerType,
      answers: formData.answers,
    };

    try {
      if (editingTest) {
        await setDoc(doc(db, 'tests', editingTest.id), testData);
      } else {
        const newDocRef = doc(collection(db, 'tests'));
        await setDoc(newDocRef, testData);
      }
      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error saving test:', error);
    }
  };

  const addAnswer = () => {
    if (!newAnswerPl.trim() && !newAnswerEn.trim()) return;

    const newAnswer: TestAnswer = {
      id: `answer-${Date.now()}`,
      name: {
        pl: newAnswerPl.trim() || newAnswerEn.trim(),
        en: newAnswerEn.trim() || newAnswerPl.trim(),
      },
    };

    setFormData({
      ...formData,
      answers: [...formData.answers, newAnswer],
    });
    setNewAnswerPl('');
    setNewAnswerEn('');
  };

  const removeAnswer = (answerId: string) => {
    setFormData({
      ...formData,
      answers: formData.answers.filter((a) => a.id !== answerId),
    });
  };

  const handleDelete = async (testId: string) => {
    if (!confirm(t('admin.confirmDelete'))) return;

    try {
      await deleteDoc(doc(db, 'tests', testId));
      fetchData();
    } catch (error) {
      console.error('Error deleting test:', error);
    }
  };

  if (isLoading) {
    return <Loading size="lg" text={t('common.loading')} />;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-charcoal">{t('admin.tests')}</h1>
        <Button onClick={() => openModal()}>{t('admin.add')}</Button>
      </div>

      <div className="space-y-4">
        {tests.map((test) => (
          <Card key={test.id}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400 mb-1">
                  {getLevelTitle(test.levelId)}
                </p>
                <h3 className="font-semibold">{getLocalizedText(test.title)}</h3>
                <p className="text-sm text-gray-500">
                  {test.timerMode} · {test.pointsPerCorrect}pts · {test.answerType} · {test.answers?.length || 0} answers
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => openModal(test)}>
                  {t('admin.edit')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500"
                  onClick={() => handleDelete(test.id)}
                >
                  {t('admin.delete')}
                </Button>
              </div>
            </div>
          </Card>
        ))}

        {tests.length === 0 && (
          <Card>
            <p className="text-center text-gray-500">{t('common.noResults')}</p>
          </Card>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingTest ? t('admin.edit') : t('admin.add')}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">
              Level
            </label>
            <select
              className="w-full px-4 py-3 rounded-lg border border-blue-gray focus:border-primary focus:ring-2 focus:ring-primary focus:ring-opacity-20"
              value={formData.levelId}
              onChange={(e) => setFormData({ ...formData, levelId: e.target.value })}
              required
            >
              {levels.map((level) => (
                <option key={level.id} value={level.id}>
                  {getLocalizedText(level.title)}
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
          <Input
            label="Title (PL)"
            value={formData.titlePl}
            onChange={(e) => setFormData({ ...formData, titlePl: e.target.value })}
            required
          />
          <Input
            label="Title (EN)"
            value={formData.titleEn}
            onChange={(e) => setFormData({ ...formData, titleEn: e.target.value })}
            required
          />

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">
              Timer Mode
            </label>
            <select
              className="w-full px-4 py-3 rounded-lg border border-blue-gray focus:border-primary focus:ring-2 focus:ring-primary focus:ring-opacity-20"
              value={formData.timerMode}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  timerMode: e.target.value as 'countdown' | 'stopwatch' | 'none',
                })
              }
            >
              <option value="none">None</option>
              <option value="countdown">Countdown</option>
              <option value="stopwatch">Stopwatch</option>
            </select>
          </div>

          {formData.timerMode === 'countdown' && (
            <Input
              type="number"
              label="Time per question (seconds)"
              value={formData.timePerQuestion}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  timePerQuestion: parseInt(e.target.value),
                })
              }
            />
          )}

          <Input
            type="number"
            label="Points per correct"
            value={formData.pointsPerCorrect}
            onChange={(e) =>
              setFormData({
                ...formData,
                pointsPerCorrect: parseInt(e.target.value),
              })
            }
          />

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">
              Answer Type
            </label>
            <select
              className="w-full px-4 py-3 rounded-lg border border-blue-gray focus:border-primary focus:ring-2 focus:ring-primary focus:ring-opacity-20"
              value={formData.answerType}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  answerType: e.target.value as 'single' | 'multiple',
                })
              }
            >
              <option value="single">Single choice</option>
              <option value="multiple">Multiple choice</option>
            </select>
          </div>

          {/* Answers Management */}
          <div>
            <label className="block text-sm font-medium text-charcoal mb-2">
              Answers ({formData.answers.length})
            </label>

            {/* Existing answers */}
            {formData.answers.length > 0 && (
              <div className="space-y-2 mb-3 max-h-40 overflow-y-auto border rounded-lg p-2">
                {formData.answers.map((answer) => (
                  <div
                    key={answer.id}
                    className="flex items-center justify-between bg-gray-50 p-2 rounded"
                  >
                    <div className="flex-1">
                      <span className="text-sm font-medium">{answer.name.pl}</span>
                      {answer.name.en !== answer.name.pl && (
                        <span className="text-xs text-gray-500 ml-2">
                          ({answer.name.en})
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAnswer(answer.id)}
                      className="text-red-500 hover:text-red-700 p-1"
                    >
                      <svg
                        className="w-4 h-4"
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
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new answer */}
            <div className="flex gap-2">
              <Input
                placeholder="Answer (PL)"
                value={newAnswerPl}
                onChange={(e) => setNewAnswerPl(e.target.value)}
                className="flex-1"
              />
              <Input
                placeholder="Answer (EN)"
                value={newAnswerEn}
                onChange={(e) => setNewAnswerEn(e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={addAnswer}
                disabled={!newAnswerPl.trim() && !newAnswerEn.trim()}
              >
                Add
              </Button>
            </div>
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
            <Button type="submit" fullWidth>
              {t('admin.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
