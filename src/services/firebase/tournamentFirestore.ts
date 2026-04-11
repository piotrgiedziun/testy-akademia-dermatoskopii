import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  addDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from './config';
import type {
  Tournament,
  TournamentAttempt,
  TournamentRankingEntry,
  UserAnswer,
} from '@/types';

// ============ TOURNAMENTS ============

export const getTournament = async (
  uuid: string
): Promise<Tournament | null> => {
  const snapshot = await getDoc(doc(db, 'tournaments', uuid));
  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  return {
    id: snapshot.id,
    name: data.name,
    testId: data.testId,
    active: data.active,
    createdAt: data.createdAt?.toDate() || new Date(),
    createdBy: data.createdBy,
  };
};

export const getAllTournaments = async (): Promise<Tournament[]> => {
  const snapshot = await getDocs(
    query(collection(db, 'tournaments'), orderBy('createdAt', 'desc'))
  );
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name,
      testId: data.testId,
      active: data.active,
      createdAt: data.createdAt?.toDate() || new Date(),
      createdBy: data.createdBy,
    };
  });
};

export const createTournament = async (
  data: Omit<Tournament, 'id' | 'createdAt'>
): Promise<string> => {
  const uuid = crypto.randomUUID();
  await setDoc(doc(db, 'tournaments', uuid), {
    name: data.name,
    testId: data.testId,
    active: data.active,
    createdBy: data.createdBy,
    createdAt: Timestamp.now(),
  });
  return uuid;
};

export const updateTournament = async (
  uuid: string,
  data: Partial<Pick<Tournament, 'name' | 'testId' | 'active'>>
): Promise<void> => {
  await updateDoc(doc(db, 'tournaments', uuid), data);
};

export const deleteTournament = async (uuid: string): Promise<void> => {
  await deleteDoc(doc(db, 'tournaments', uuid));
};

// ============ TOURNAMENT ATTEMPTS ============

export const createTournamentAttempt = async (
  tournamentId: string,
  participantName: string
): Promise<string> => {
  const docRef = await addDoc(
    collection(db, 'tournaments', tournamentId, 'attempts'),
    {
      participantName,
      termsAcceptedAt: Timestamp.now(),
      startedAt: Timestamp.now(),
      completedAt: null,
      answers: [],
      score: 0,
      accuracy: 0,
      totalTimeMs: 0,
    }
  );
  return docRef.id;
};

export const getTournamentAttempt = async (
  tournamentId: string,
  attemptId: string
): Promise<TournamentAttempt | null> => {
  const snapshot = await getDoc(
    doc(db, 'tournaments', tournamentId, 'attempts', attemptId)
  );
  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  return {
    id: snapshot.id,
    participantName: data.participantName,
    termsAcceptedAt: data.termsAcceptedAt?.toDate() || new Date(),
    startedAt: data.startedAt?.toDate() || new Date(),
    completedAt: data.completedAt?.toDate() || null,
    answers: data.answers || [],
    score: data.score || 0,
    accuracy: data.accuracy || 0,
    totalTimeMs: data.totalTimeMs || 0,
  };
};

export const addTournamentAnswer = async (
  tournamentId: string,
  attemptId: string,
  answer: UserAnswer,
  currentAnswers: UserAnswer[],
  pointsPerCorrect: number
): Promise<void> => {
  const newAnswers = [...currentAnswers, answer];
  const correctCount = newAnswers.filter((a) => a.correct).length;
  const score = correctCount * pointsPerCorrect;
  const accuracy =
    Math.round((correctCount / newAnswers.length) * 10000) / 100;

  await updateDoc(
    doc(db, 'tournaments', tournamentId, 'attempts', attemptId),
    {
      answers: newAnswers,
      score,
      accuracy,
    }
  );
};

export const completeTournamentAttempt = async (
  tournamentId: string,
  attemptId: string,
  answers: UserAnswer[],
  pointsPerCorrect: number
): Promise<void> => {
  const correctCount = answers.filter((a) => a.correct).length;
  const score = correctCount * pointsPerCorrect;
  const accuracy =
    Math.round((correctCount / answers.length) * 10000) / 100;
  const totalTimeMs = answers.reduce((sum, a) => sum + a.timeSpent * 1000, 0);

  await updateDoc(
    doc(db, 'tournaments', tournamentId, 'attempts', attemptId),
    {
      completedAt: Timestamp.now(),
      answers,
      score,
      accuracy,
      totalTimeMs,
    }
  );
};

export const deleteTournamentAttempt = async (
  tournamentId: string,
  attemptId: string
): Promise<void> => {
  await deleteDoc(
    doc(db, 'tournaments', tournamentId, 'attempts', attemptId)
  );
};

export const getTournamentRanking = async (
  tournamentId: string
): Promise<TournamentRankingEntry[]> => {
  const snapshot = await getDocs(
    query(
      collection(db, 'tournaments', tournamentId, 'attempts'),
      where('completedAt', '!=', null),
      orderBy('completedAt')
    )
  );

  const attempts = snapshot.docs.map((d) => {
    const data = d.data();
    return {
      attemptId: d.id,
      participantName: data.participantName as string,
      score: (data.score as number) || 0,
      accuracy: (data.accuracy as number) || 0,
      totalTimeMs: (data.totalTimeMs as number) || 0,
      completedAt: data.completedAt?.toDate() || new Date(),
    };
  });

  // Sort: score desc, then totalTimeMs asc
  attempts.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.totalTimeMs - b.totalTimeMs;
  });

  return attempts.map((a, i) => ({
    ...a,
    rank: i + 1,
  }));
};
