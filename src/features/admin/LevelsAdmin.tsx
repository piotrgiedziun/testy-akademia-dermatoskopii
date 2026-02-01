import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Button, Input, Modal, Loading } from '@/components/ui';
import { getLevels } from '@/services/firebase/firestore';
import { db } from '@/services/firebase/config';
import { doc, setDoc, deleteDoc, collection } from 'firebase/firestore';
import type { Level } from '@/types';

export function LevelsAdmin() {
  const { t, i18n } = useTranslation();
  const [levels, setLevels] = useState<Level[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLevel, setEditingLevel] = useState<Level | null>(null);
  const [formData, setFormData] = useState({
    order: 1,
    titlePl: '',
    titleEn: '',
    descriptionPl: '',
    descriptionEn: '',
  });

  const fetchLevels = async () => {
    try {
      const data = await getLevels();
      setLevels(data);
    } catch (error) {
      console.error('Error fetching levels:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLevels();
  }, []);

  const getLocalizedText = (text: { pl: string; en: string }) => {
    return i18n.language === 'pl' ? text.pl : text.en;
  };

  const openModal = (level?: Level) => {
    if (level) {
      setEditingLevel(level);
      setFormData({
        order: level.order,
        titlePl: level.title.pl,
        titleEn: level.title.en,
        descriptionPl: level.description.pl,
        descriptionEn: level.description.en,
      });
    } else {
      setEditingLevel(null);
      setFormData({
        order: levels.length + 1,
        titlePl: '',
        titleEn: '',
        descriptionPl: '',
        descriptionEn: '',
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const levelData = {
      order: formData.order,
      title: { pl: formData.titlePl, en: formData.titleEn },
      description: { pl: formData.descriptionPl, en: formData.descriptionEn },
    };

    try {
      if (editingLevel) {
        await setDoc(doc(db, 'levels', editingLevel.id), levelData);
      } else {
        const newDocRef = doc(collection(db, 'levels'));
        await setDoc(newDocRef, levelData);
      }
      setIsModalOpen(false);
      fetchLevels();
    } catch (error) {
      console.error('Error saving level:', error);
    }
  };

  const handleDelete = async (levelId: string) => {
    if (!confirm(t('admin.confirmDelete'))) return;

    try {
      await deleteDoc(doc(db, 'levels', levelId));
      fetchLevels();
    } catch (error) {
      console.error('Error deleting level:', error);
    }
  };

  if (isLoading) {
    return <Loading size="lg" text={t('common.loading')} />;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-charcoal">{t('admin.levels')}</h1>
        <Button onClick={() => openModal()}>{t('admin.add')}</Button>
      </div>

      <div className="space-y-4">
        {levels.map((level) => (
          <Card key={level.id} data-testid="admin-level-row">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold">{level.order}</span>
                </div>
                <div>
                  <h3 className="font-semibold">{getLocalizedText(level.title)}</h3>
                  <p className="text-sm text-gray-500">
                    {getLocalizedText(level.description)}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => openModal(level)}>
                  {t('admin.edit')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500"
                  onClick={() => handleDelete(level.id)}
                >
                  {t('admin.delete')}
                </Button>
              </div>
            </div>
          </Card>
        ))}

        {levels.length === 0 && (
          <Card>
            <p className="text-center text-gray-500">{t('common.noResults')}</p>
          </Card>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingLevel ? t('admin.edit') : t('admin.add')}
        size="4xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4" data-testid="level-form">
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
          <Input
            label="Description (PL)"
            value={formData.descriptionPl}
            onChange={(e) =>
              setFormData({ ...formData, descriptionPl: e.target.value })
            }
          />
          <Input
            label="Description (EN)"
            value={formData.descriptionEn}
            onChange={(e) =>
              setFormData({ ...formData, descriptionEn: e.target.value })
            }
          />
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
