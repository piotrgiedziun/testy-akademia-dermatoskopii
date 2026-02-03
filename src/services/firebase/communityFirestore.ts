import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  Timestamp,
  increment,
  DocumentSnapshot,
  FieldValue,
} from 'firebase/firestore';
import { db } from './config';
import type {
  CommunityCase,
  CaseComment,
  ContentFlag,
  UserCommunityStats,
  MonthlyLeaderboard,
  CommunityCaseImage,
  CommentAnnotation,
  User,
  AccessRequest,
} from '@/types';

// ============ USERS ============

export const getAllUsers = async (): Promise<User[]> => {
  const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      uid: doc.id,
      email: data.email,
      displayName: data.displayName,
      role: data.role,
      permissions: data.permissions || { casesAccess: false, moderator: false },
      createdAt: data.createdAt?.toDate() || new Date(),
    };
  });
};

export const updateUserPermissions = async (
  userId: string,
  permissions: { casesAccess?: boolean; moderator?: boolean }
): Promise<void> => {
  const docRef = doc(db, 'users', userId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) throw new Error('User not found');

  const currentPermissions = snapshot.data().permissions || { casesAccess: false, moderator: false };
  await updateDoc(docRef, {
    permissions: { ...currentPermissions, ...permissions },
  });
};

export const updateUserRole = async (
  userId: string,
  role: 'user' | 'admin'
): Promise<void> => {
  const docRef = doc(db, 'users', userId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) throw new Error('User not found');

  await updateDoc(docRef, { role });
};

export const getUserById = async (userId: string): Promise<User | null> => {
  const docRef = doc(db, 'users', userId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  return {
    uid: snapshot.id,
    email: data.email,
    displayName: data.displayName,
    role: data.role,
    permissions: data.permissions || { casesAccess: false, moderator: false },
    createdAt: data.createdAt?.toDate() || new Date(),
  };
};

// ============ COMMUNITY CASES ============

export const getCommunityCases = async (
  pageSize: number = 10,
  lastDoc?: DocumentSnapshot
): Promise<{ cases: CommunityCase[]; lastDoc: DocumentSnapshot | null }> => {
  let q = query(
    collection(db, 'communityCases'),
    where('status', '==', 'active'),
    orderBy('createdAt', 'desc'),
    limit(pageSize)
  );

  if (lastDoc) {
    q = query(q, startAfter(lastDoc));
  }

  const snapshot = await getDocs(q);
  const cases = snapshot.docs.map((doc) => convertCaseDoc(doc));
  const newLastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;

  return { cases, lastDoc: newLastDoc };
};

export const getCommunityCase = async (caseId: string): Promise<CommunityCase | null> => {
  const docRef = doc(db, 'communityCases', caseId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;
  return convertCaseDoc(snapshot);
};

export const getUserCases = async (userId: string): Promise<CommunityCase[]> => {
  const q = query(
    collection(db, 'communityCases'),
    where('authorId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => convertCaseDoc(doc));
};

export const createCommunityCase = async (
  authorId: string,
  authorName: string,
  data: {
    title: string;
    description: string;
    images: CommunityCaseImage[];
    diagnosis?: { text: string; histopathologyResult?: string };
  }
): Promise<string> => {
  const caseData = {
    authorId,
    authorName,
    title: data.title,
    description: data.description,
    images: data.images,
    diagnosis: data.diagnosis
      ? { ...data.diagnosis, addedAt: Timestamp.now() }
      : null,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    commentsCount: 0,
    status: 'active',
  };

  const docRef = await addDoc(collection(db, 'communityCases'), caseData);

  // Update user stats
  await updateUserCommunityStats(authorId, authorName, { casesPosted: 1 });

  return docRef.id;
};

export const updateCommunityCase = async (
  caseId: string,
  data: {
    title?: string;
    description?: string;
    images?: CommunityCaseImage[];
    diagnosis?: { text: string; histopathologyResult?: string };
    status?: CommunityCase['status'];
  }
): Promise<void> => {
  const docRef = doc(db, 'communityCases', caseId);

  // Build update object
  const updateFields: { [key: string]: string | object | FieldValue | CommunityCase['images'] | CommunityCase['status'] } = {
    updatedAt: Timestamp.now(),
  };

  if (data.title !== undefined) updateFields.title = data.title;
  if (data.description !== undefined) updateFields.description = data.description;
  if (data.images !== undefined) updateFields.images = data.images;
  if (data.status !== undefined) updateFields.status = data.status;
  if (data.diagnosis) {
    updateFields.diagnosis = {
      ...data.diagnosis,
      addedAt: Timestamp.now(),
    };
  }

  await updateDoc(docRef, updateFields);
};

export const addDiagnosisToCase = async (
  caseId: string,
  diagnosis: { text: string; histopathologyResult?: string }
): Promise<void> => {
  const docRef = doc(db, 'communityCases', caseId);
  await updateDoc(docRef, {
    diagnosis: {
      ...diagnosis,
      addedAt: Timestamp.now(),
    },
    updatedAt: Timestamp.now(),
  });
};

export const deleteCommunityCase = async (caseId: string): Promise<void> => {
  await deleteDoc(doc(db, 'communityCases', caseId));
};

function convertCaseDoc(doc: DocumentSnapshot): CommunityCase {
  const data = doc.data()!;
  return {
    id: doc.id,
    authorId: data.authorId,
    authorName: data.authorName,
    title: data.title,
    description: data.description,
    images: data.images || [],
    diagnosis: data.diagnosis
      ? {
          text: data.diagnosis.text,
          histopathologyResult: data.diagnosis.histopathologyResult,
          addedAt: data.diagnosis.addedAt?.toDate() || new Date(),
        }
      : undefined,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
    commentsCount: data.commentsCount || 0,
    status: data.status || 'active',
  };
}

// ============ COMMENTS ============

export const getCaseComments = async (caseId: string): Promise<CaseComment[]> => {
  const q = query(
    collection(db, 'communityCases', caseId, 'comments'),
    where('status', '==', 'active'),
    orderBy('createdAt', 'asc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => convertCommentDoc(doc, caseId));
};

export const createCaseComment = async (
  caseId: string,
  authorId: string,
  authorName: string,
  data: {
    text: string;
    annotation?: {
      imageId: string;
      drawings: CommentAnnotation[];
    };
    parentCommentId?: string;
  }
): Promise<string> => {
  const commentData = {
    caseId,
    authorId,
    authorName,
    text: data.text,
    annotation: data.annotation || null,
    parentCommentId: data.parentCommentId || null,
    createdAt: Timestamp.now(),
    status: 'active',
  };

  const docRef = await addDoc(
    collection(db, 'communityCases', caseId, 'comments'),
    commentData
  );

  // Increment comments count on the case
  await updateDoc(doc(db, 'communityCases', caseId), {
    commentsCount: increment(1),
    updatedAt: Timestamp.now(),
  });

  // Update user stats
  await updateUserCommunityStats(authorId, authorName, { commentsPosted: 1 });

  return docRef.id;
};

export const updateCommentStatus = async (
  caseId: string,
  commentId: string,
  status: 'active' | 'flagged' | 'hidden'
): Promise<void> => {
  const docRef = doc(db, 'communityCases', caseId, 'comments', commentId);
  await updateDoc(docRef, { status });
};

export const deleteCaseComment = async (
  caseId: string,
  commentId: string
): Promise<void> => {
  const commentRef = doc(db, 'communityCases', caseId, 'comments', commentId);
  await deleteDoc(commentRef);

  // Decrement comments count on the case
  await updateDoc(doc(db, 'communityCases', caseId), {
    commentsCount: increment(-1),
    updatedAt: Timestamp.now(),
  });
};

function convertCommentDoc(doc: DocumentSnapshot, caseId: string): CaseComment {
  const data = doc.data()!;
  return {
    id: doc.id,
    caseId,
    authorId: data.authorId,
    authorName: data.authorName,
    text: data.text,
    annotation: data.annotation || undefined,
    parentCommentId: data.parentCommentId || undefined,
    createdAt: data.createdAt?.toDate() || new Date(),
    status: data.status || 'active',
  };
}

export const getCaseCommentById = async (
  caseId: string,
  commentId: string
): Promise<CaseComment | null> => {
  const docRef = doc(db, 'communityCases', caseId, 'comments', commentId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;
  return convertCommentDoc(snapshot, caseId);
};

// ============ CONTENT FLAGS ============

export const createContentFlag = async (
  contentType: 'case' | 'comment',
  contentId: string,
  caseId: string,
  reporterId: string,
  reporterName: string,
  reason: string
): Promise<string> => {
  const flagData = {
    contentType,
    contentId,
    caseId,
    reporterId,
    reporterName,
    reason,
    createdAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(db, 'contentFlags'), flagData);

  // Update content status to flagged
  if (contentType === 'case') {
    await updateDoc(doc(db, 'communityCases', contentId), { status: 'flagged' });
  } else {
    await updateDoc(doc(db, 'communityCases', caseId, 'comments', contentId), {
      status: 'flagged',
    });
  }

  return docRef.id;
};

export const getPendingFlags = async (): Promise<ContentFlag[]> => {
  const q = query(
    collection(db, 'contentFlags'),
    where('resolvedAt', '==', null),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => convertFlagDoc(doc));
};

export const getUnresolvedFlags = async (): Promise<ContentFlag[]> => {
  const q = query(
    collection(db, 'contentFlags'),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map((doc) => convertFlagDoc(doc))
    .filter((flag) => !flag.resolvedAt);
};

export const resolveFlag = async (
  flagId: string,
  resolvedBy: string,
  resolution: 'dismissed' | 'hidden'
): Promise<void> => {
  const flagRef = doc(db, 'contentFlags', flagId);
  const flagSnapshot = await getDoc(flagRef);
  if (!flagSnapshot.exists()) throw new Error('Flag not found');

  const flagData = flagSnapshot.data();

  await updateDoc(flagRef, {
    resolvedAt: Timestamp.now(),
    resolvedBy,
    resolution,
  });

  // Update content status based on resolution
  const newStatus = resolution === 'hidden' ? 'hidden' : 'active';
  if (flagData.contentType === 'case') {
    await updateDoc(doc(db, 'communityCases', flagData.contentId), {
      status: newStatus,
    });
  } else {
    await updateDoc(
      doc(db, 'communityCases', flagData.caseId, 'comments', flagData.contentId),
      { status: newStatus }
    );
  }
};

function convertFlagDoc(doc: DocumentSnapshot): ContentFlag {
  const data = doc.data()!;
  return {
    id: doc.id,
    contentType: data.contentType,
    contentId: data.contentId,
    caseId: data.caseId,
    reporterId: data.reporterId,
    reporterName: data.reporterName,
    reason: data.reason,
    createdAt: data.createdAt?.toDate() || new Date(),
    resolvedAt: data.resolvedAt?.toDate() || undefined,
    resolvedBy: data.resolvedBy || undefined,
    resolution: data.resolution || undefined,
  };
}

// ============ USER COMMUNITY STATS ============

export const getUserCommunityStats = async (
  userId: string
): Promise<UserCommunityStats | null> => {
  const docRef = doc(db, 'userCommunityStats', userId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  return {
    userId: snapshot.id,
    displayName: data.displayName,
    casesPosted: data.casesPosted || 0,
    commentsPosted: data.commentsPosted || 0,
    diagnosesRevealed: data.diagnosesRevealed || 0,
    lastActivityAt: data.lastActivityAt?.toDate() || new Date(),
  };
};

export const updateUserCommunityStats = async (
  userId: string,
  displayName: string,
  updates: {
    casesPosted?: number;
    commentsPosted?: number;
    diagnosesRevealed?: number;
  }
): Promise<void> => {
  const docRef = doc(db, 'userCommunityStats', userId);
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) {
    // Create new stats document
    await setDoc(docRef, {
      displayName,
      casesPosted: updates.casesPosted || 0,
      commentsPosted: updates.commentsPosted || 0,
      diagnosesRevealed: updates.diagnosesRevealed || 0,
      lastActivityAt: Timestamp.now(),
    });
  } else {
    // Update existing stats
    const updateData: { [key: string]: string | FieldValue } = {
      displayName,
      lastActivityAt: Timestamp.now(),
    };
    if (updates.casesPosted) updateData.casesPosted = increment(updates.casesPosted);
    if (updates.commentsPosted) updateData.commentsPosted = increment(updates.commentsPosted);
    if (updates.diagnosesRevealed)
      updateData.diagnosesRevealed = increment(updates.diagnosesRevealed);

    await updateDoc(docRef, updateData);
  }

  // Update monthly leaderboard
  await updateMonthlyLeaderboard(userId, displayName);
};

export const incrementDiagnosisReveal = async (
  userId: string,
  displayName: string
): Promise<void> => {
  await updateUserCommunityStats(userId, displayName, { diagnosesRevealed: 1 });
};

// ============ LEADERBOARD ============

export const getMonthlyLeaderboard = async (
  month?: string
): Promise<MonthlyLeaderboard | null> => {
  const monthKey = month || getCurrentMonth();
  const docRef = doc(db, 'leaderboards', monthKey);
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  return {
    month: monthKey,
    entries: data.entries || [],
    updatedAt: data.updatedAt?.toDate() || new Date(),
  };
};

export const updateMonthlyLeaderboard = async (
  userId: string,
  displayName: string
): Promise<void> => {
  const monthKey = getCurrentMonth();
  const docRef = doc(db, 'leaderboards', monthKey);
  const snapshot = await getDoc(docRef);

  const stats = await getUserCommunityStats(userId);
  if (!stats) return;

  const newEntry = {
    userId,
    displayName,
    casesPosted: stats.casesPosted,
    commentsPosted: stats.commentsPosted,
    totalContributions: stats.casesPosted + stats.commentsPosted,
    rank: 0,
  };

  let entries: Array<{
    userId: string;
    displayName: string;
    casesPosted: number;
    commentsPosted: number;
    totalContributions: number;
    rank: number;
  }>;

  if (!snapshot.exists()) {
    entries = [newEntry];
  } else {
    entries = snapshot.data().entries || [];
    const existingIndex = entries.findIndex((e) => e.userId === userId);

    if (existingIndex >= 0) {
      entries[existingIndex] = newEntry;
    } else {
      entries.push(newEntry);
    }
  }

  // Sort by total contributions and assign ranks
  entries.sort((a, b) => b.totalContributions - a.totalContributions);
  entries.forEach((entry, index) => {
    entry.rank = index + 1;
  });

  await setDoc(docRef, {
    entries: entries.slice(0, 100), // Keep top 100
    updatedAt: Timestamp.now(),
  });
};

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ============ ACCESS REQUESTS ============

export const createAccessRequest = async (
  userId: string,
  userEmail: string,
  userName: string,
  data: { pwz?: string; description?: string }
): Promise<string> => {
  // Check if user already has a pending request
  const existingRequest = await getUserAccessRequest(userId);
  if (existingRequest && existingRequest.status === 'pending') {
    throw new Error('You already have a pending access request');
  }

  const requestData = {
    userId,
    userEmail,
    userName,
    pwz: data.pwz || null,
    description: data.description || null,
    status: 'pending',
    createdAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(db, 'accessRequests'), requestData);
  return docRef.id;
};

export const getUserAccessRequest = async (
  userId: string
): Promise<AccessRequest | null> => {
  const q = query(
    collection(db, 'accessRequests'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(1)
  );
  const snapshot = await getDocs(q);

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  const data = doc.data();
  return {
    id: doc.id,
    userId: data.userId,
    userEmail: data.userEmail,
    userName: data.userName,
    pwz: data.pwz || undefined,
    description: data.description || undefined,
    status: data.status,
    createdAt: data.createdAt?.toDate() || new Date(),
    reviewedAt: data.reviewedAt?.toDate() || undefined,
    reviewedBy: data.reviewedBy || undefined,
    rejectionReason: data.rejectionReason || undefined,
  };
};

export const getPendingAccessRequests = async (): Promise<AccessRequest[]> => {
  const q = query(
    collection(db, 'accessRequests'),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'asc')
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      userId: data.userId,
      userEmail: data.userEmail,
      userName: data.userName,
      pwz: data.pwz || undefined,
      description: data.description || undefined,
      status: data.status,
      createdAt: data.createdAt?.toDate() || new Date(),
      reviewedAt: data.reviewedAt?.toDate() || undefined,
      reviewedBy: data.reviewedBy || undefined,
      rejectionReason: data.rejectionReason || undefined,
    };
  });
};

export const approveAccessRequest = async (
  requestId: string,
  reviewerId: string
): Promise<void> => {
  const requestRef = doc(db, 'accessRequests', requestId);
  const requestSnapshot = await getDoc(requestRef);

  if (!requestSnapshot.exists()) throw new Error('Request not found');

  const requestData = requestSnapshot.data();

  // Update request status
  await updateDoc(requestRef, {
    status: 'approved',
    reviewedAt: Timestamp.now(),
    reviewedBy: reviewerId,
  });

  // Grant casesAccess permission to user
  await updateUserPermissions(requestData.userId, { casesAccess: true });
};

export const rejectAccessRequest = async (
  requestId: string,
  reviewerId: string,
  reason?: string
): Promise<void> => {
  const requestRef = doc(db, 'accessRequests', requestId);

  await updateDoc(requestRef, {
    status: 'rejected',
    reviewedAt: Timestamp.now(),
    reviewedBy: reviewerId,
    rejectionReason: reason || null,
  });
};
