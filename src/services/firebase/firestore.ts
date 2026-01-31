import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  setDoc,
  query,
  where,
  orderBy,
  addDoc,
  Timestamp,
  UpdateData,
  DocumentData,
  increment,
} from 'firebase/firestore';
import { db } from './config';
import type {
  Level,
  Test,
  Case,
  TestAttempt,
  UserProgress,
  UserAnswer,
  UserProgressStats,
} from '@/types';

// Levels
export const getLevels = async (): Promise<Level[]> => {
  const q = query(collection(db, 'levels'), orderBy('order'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Level[];
};

export const getLevel = async (levelId: string): Promise<Level | null> => {
  const docRef = doc(db, 'levels', levelId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() } as Level;
};

// Tests
export const getTestsByLevel = async (levelId: string): Promise<Test[]> => {
  const q = query(
    collection(db, 'tests'),
    where('levelId', '==', levelId),
    orderBy('order')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Test[];
};

export const getTest = async (testId: string): Promise<Test | null> => {
  const docRef = doc(db, 'tests', testId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() } as Test;
};

// Cases
export const getCasesByTest = async (testId: string): Promise<Case[]> => {
  const q = query(
    collection(db, 'cases'),
    where('testId', '==', testId),
    orderBy('order')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Case[];
};

export const getCase = async (caseId: string): Promise<Case | null> => {
  const docRef = doc(db, 'cases', caseId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() } as Case;
};

// Test Attempts
export const createTestAttempt = async (
  userId: string,
  testId: string
): Promise<string> => {
  const attemptData = {
    testId,
    startedAt: Timestamp.now(),
    completedAt: null,
    answers: [],
    score: 0,
    accuracy: 0,
  };

  const docRef = await addDoc(
    collection(db, 'userProgress', userId, 'attempts'),
    attemptData
  );
  return docRef.id;
};

export const updateTestAttempt = async (
  userId: string,
  attemptId: string,
  data: Partial<Omit<TestAttempt, 'id' | 'testId' | 'userId'>>
): Promise<void> => {
  const docRef = doc(db, 'userProgress', userId, 'attempts', attemptId);
  const updateData: UpdateData<DocumentData> = { ...data };

  if (data.completedAt) {
    updateData.completedAt = Timestamp.fromDate(data.completedAt);
  }

  await updateDoc(docRef, updateData);
};

export const getTestAttempt = async (
  userId: string,
  attemptId: string
): Promise<TestAttempt | null> => {
  const docRef = doc(db, 'userProgress', userId, 'attempts', attemptId);
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  return {
    id: snapshot.id,
    userId,
    testId: data.testId,
    startedAt: data.startedAt?.toDate() || new Date(),
    completedAt: data.completedAt?.toDate() || null,
    answers: data.answers || [],
    score: data.score || 0,
    accuracy: data.accuracy || 0,
  };
};

export const getUserAttempts = async (userId: string): Promise<TestAttempt[]> => {
  const q = query(
    collection(db, 'userProgress', userId, 'attempts'),
    orderBy('startedAt', 'desc')
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      userId,
      testId: data.testId,
      startedAt: data.startedAt?.toDate() || new Date(),
      completedAt: data.completedAt?.toDate() || null,
      answers: data.answers || [],
      score: data.score || 0,
      accuracy: data.accuracy || 0,
    };
  });
};

export const getUserProgressForTest = async (
  userId: string,
  testId: string
): Promise<UserProgress | null> => {
  const attempts = await getUserAttempts(userId);
  const testAttempts = attempts.filter((a) => a.testId === testId && a.completedAt);

  if (testAttempts.length === 0) return null;

  const bestAttempt = testAttempts.reduce((best, current) =>
    current.score > best.score ? current : best
  );

  return {
    testId,
    totalAttempts: testAttempts.length,
    bestScore: bestAttempt.score,
    bestAccuracy: bestAttempt.accuracy,
    lastAttemptAt: testAttempts[0].completedAt || testAttempts[0].startedAt,
  };
};

// Add answer to attempt
export const addAnswerToAttempt = async (
  userId: string,
  attemptId: string,
  answer: UserAnswer,
  currentAnswers: UserAnswer[],
  pointsPerCorrect: number
): Promise<void> => {
  const newAnswers = [...currentAnswers, answer];
  const correctCount = newAnswers.filter((a) => a.correct).length;
  const score = correctCount * pointsPerCorrect;
  const accuracy = (correctCount / newAnswers.length) * 100;

  await updateTestAttempt(userId, attemptId, {
    answers: newAnswers,
    score,
    accuracy,
  });
};

// ============ USER PROGRESS STATS ============

export const getUserProgressStats = async (
  userId: string
): Promise<UserProgressStats | null> => {
  const docRef = doc(db, 'userProgress', userId);
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  return {
    totalPoints: data.totalPoints || 0,
    testsCompleted: data.testsCompleted || 0,
    totalAccuracySum: data.totalAccuracySum || 0,
    totalTimeMs: data.totalTimeMs || 0,
    totalQuestions: data.totalQuestions || 0,
    lastUpdatedAt: data.lastUpdatedAt?.toDate() || new Date(),
  };
};

export const completeTestAttempt = async (
  userId: string,
  attemptId: string,
  answers: UserAnswer[],
  pointsPerCorrect: number
): Promise<void> => {
  const correctCount = answers.filter((a) => a.correct).length;
  const score = correctCount * pointsPerCorrect;
  const accuracy = (correctCount / answers.length) * 100;
  const totalTimeMs = answers.reduce((sum, a) => sum + a.timeSpent * 1000, 0);

  // Update the attempt
  await updateTestAttempt(userId, attemptId, {
    completedAt: new Date(),
    answers,
    score,
    accuracy,
  });

  // Update aggregated stats
  const statsRef = doc(db, 'userProgress', userId);
  const statsSnapshot = await getDoc(statsRef);

  if (!statsSnapshot.exists()) {
    // Create new stats document
    await setDoc(statsRef, {
      totalPoints: score,
      testsCompleted: 1,
      totalAccuracySum: accuracy,
      totalTimeMs: totalTimeMs,
      totalQuestions: answers.length,
      lastUpdatedAt: Timestamp.now(),
    });
  } else {
    // Update existing stats
    await updateDoc(statsRef, {
      totalPoints: increment(score),
      testsCompleted: increment(1),
      totalAccuracySum: increment(accuracy),
      totalTimeMs: increment(totalTimeMs),
      totalQuestions: increment(answers.length),
      lastUpdatedAt: Timestamp.now(),
    });
  }
};
