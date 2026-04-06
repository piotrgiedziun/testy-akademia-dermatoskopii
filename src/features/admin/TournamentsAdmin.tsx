import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Button, Input, Modal, Loading } from '@/components/ui';
import { useAuthStore } from '@/stores';
import { db } from '@/services/firebase/config';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import {
  getAllTournaments,
  createTournament,
  updateTournament,
  deleteTournament,
} from '@/services/firebase/tournamentFirestore';
import type { Tournament, Test } from '@/types';

export function TournamentsAdmin() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [tests, setTests] = useState<Test[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    namePl: '',
    nameEn: '',
    testId: '',
    active: true,
  });

  const getLocalizedText = (text: { pl: string; en: string }) => {
    return i18n.language === 'pl' ? text.pl : text.en;
  };

  const fetchData = async () => {
    try {
      const testsSnapshot = await getDocs(
        query(collection(db, 'tests'), orderBy('order'))
      );
      setTests(
        testsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Test[]
      );
    } catch (error) {
      console.error('Error fetching tests:', error);
    }

    try {
      const tournamentsData = await getAllTournaments();
      setTournaments(tournamentsData);
    } catch (error) {
      console.error('Error fetching tournaments:', error);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openModal = (tournament?: Tournament) => {
    if (tournament) {
      setEditingTournament(tournament);
      setFormData({
        namePl: tournament.name.pl,
        nameEn: tournament.name.en,
        testId: tournament.testId,
        active: tournament.active,
      });
    } else {
      setEditingTournament(null);
      setFormData({
        namePl: '',
        nameEn: '',
        testId: tests[0]?.id || '',
        active: true,
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      if (editingTournament) {
        await updateTournament(editingTournament.id, {
          name: { pl: formData.namePl, en: formData.nameEn },
          testId: formData.testId,
          active: formData.active,
        });
      } else {
        await createTournament({
          name: { pl: formData.namePl, en: formData.nameEn },
          testId: formData.testId,
          active: formData.active,
          createdBy: user.uid,
        });
      }
      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error saving tournament:', error);
    }
  };

  const handleToggleActive = async (tournament: Tournament) => {
    try {
      await updateTournament(tournament.id, { active: !tournament.active });
      fetchData();
    } catch (error) {
      console.error('Error toggling tournament:', error);
    }
  };

  const handleDelete = async (tournamentId: string) => {
    if (!confirm(t('admin.confirmDelete'))) return;

    try {
      await deleteTournament(tournamentId);
      fetchData();
    } catch (error) {
      console.error('Error deleting tournament:', error);
    }
  };

  const copyLink = (tournamentId: string) => {
    const link = `${window.location.origin}/tournament/${tournamentId}`;
    navigator.clipboard.writeText(link);
    setCopiedId(tournamentId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getTestTitle = (testId: string) => {
    const test = tests.find((t) => t.id === testId);
    return test ? getLocalizedText(test.title) : testId;
  };

  if (isLoading) {
    return <Loading size="lg" text={t('common.loading')} />;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-charcoal">
          {t('admin.tournaments')}
        </h1>
        <Button onClick={() => openModal()}>{t('admin.add')}</Button>
      </div>

      <div className="space-y-4">
        {tournaments.map((tournament) => (
          <Card key={tournament.id}>
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold">
                  {getLocalizedText(tournament.name)}
                </h3>
                <p className="text-sm text-gray-500">
                  {t('tournament.test')}: {getTestTitle(tournament.testId)}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {tournament.createdAt.toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => copyLink(tournament.id)}
                >
                  {copiedId === tournament.id
                    ? t('tournament.copied')
                    : t('tournament.copyLink')}
                </Button>
                <Button
                  variant={tournament.active ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => handleToggleActive(tournament)}
                >
                  {tournament.active
                    ? t('admin.active')
                    : t('admin.inactive')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openModal(tournament)}
                >
                  {t('admin.edit')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500"
                  onClick={() => handleDelete(tournament.id)}
                >
                  {t('admin.delete')}
                </Button>
              </div>
            </div>
          </Card>
        ))}

        {tournaments.length === 0 && (
          <Card>
            <p className="text-center text-gray-500">{t('common.noResults')}</p>
          </Card>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={
          editingTournament ? t('admin.edit') : t('admin.add')
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label={t('tournament.namePl')}
            value={formData.namePl}
            onChange={(e) =>
              setFormData({ ...formData, namePl: e.target.value })
            }
            required
          />
          <Input
            label={t('tournament.nameEn')}
            value={formData.nameEn}
            onChange={(e) =>
              setFormData({ ...formData, nameEn: e.target.value })
            }
            required
          />

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">
              {t('tournament.test')}
            </label>
            <select
              className="w-full px-4 py-3 rounded-lg border border-blue-gray focus:border-primary focus:ring-2 focus:ring-primary focus:ring-opacity-20"
              value={formData.testId}
              onChange={(e) =>
                setFormData({ ...formData, testId: e.target.value })
              }
              required
            >
              {tests.map((test) => (
                <option key={test.id} value={test.id}>
                  {getLocalizedText(test.title)}
                  {test.active === false ? ` (${t('admin.inactive')})` : ''}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.active}
              onChange={(e) =>
                setFormData({ ...formData, active: e.target.checked })
              }
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span className="text-sm font-medium text-charcoal">
              {t('admin.active')}
            </span>
          </label>

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
