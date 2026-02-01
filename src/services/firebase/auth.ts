import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  onAuthStateChanged,
  User as FirebaseUser,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { auth, db } from './config';
import type { User } from '@/types';

export const signUp = async (
  email: string,
  password: string,
  displayName: string
): Promise<User> => {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const { user: firebaseUser } = userCredential;

  await updateProfile(firebaseUser, { displayName });

  const now = new Date();
  const userData: Omit<User, 'uid'> = {
    email,
    displayName,
    role: 'user',
    createdAt: now,
  };

  await setDoc(doc(db, 'users', firebaseUser.uid), {
    ...userData,
    createdAt: Timestamp.fromDate(now),
  });

  return {
    uid: firebaseUser.uid,
    ...userData,
  };
};

export const signIn = async (email: string, password: string): Promise<User> => {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const userData = await getUserData(userCredential.user.uid);

  if (!userData) {
    throw new Error('User data not found');
  }

  return userData;
};

export const signOut = async (): Promise<void> => {
  await firebaseSignOut(auth);
};

export const getUserData = async (uid: string): Promise<User | null> => {
  const userDoc = await getDoc(doc(db, 'users', uid));

  if (!userDoc.exists()) {
    return null;
  }

  const data = userDoc.data();
  return {
    uid,
    email: data.email,
    displayName: data.displayName,
    role: data.role,
    permissions: data.permissions || { casesAccess: false, moderator: false },
    termsAcceptedAt: data.termsAcceptedAt?.toDate() || undefined,
    createdAt: data.createdAt?.toDate() || new Date(),
  };
};

export const subscribeToAuthChanges = (
  callback: (user: FirebaseUser | null) => void
): (() => void) => {
  return onAuthStateChanged(auth, callback);
};

export const signInWithGoogle = async (): Promise<User> => {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  const { user: firebaseUser } = result;

  let userData = await getUserData(firebaseUser.uid);
  if (!userData) {
    const newUserData: Omit<User, 'uid'> = {
      email: firebaseUser.email || '',
      displayName: firebaseUser.displayName || '',
      role: 'user',
      createdAt: new Date(),
    };
    await setDoc(doc(db, 'users', firebaseUser.uid), newUserData);
    userData = { uid: firebaseUser.uid, ...newUserData };
  }

  return userData;
};

export const acceptTerms = async (uid: string): Promise<void> => {
  const userRef = doc(db, 'users', uid);
  await updateDoc(userRef, {
    termsAcceptedAt: Timestamp.now(),
  });
};
