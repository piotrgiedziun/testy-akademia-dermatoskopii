// Localized string type for multilingual content
export interface LocalizedString {
  pl: string;
  en: string;
}

// Level in the course hierarchy
export interface Level {
  id: string;
  order: number;
  title: LocalizedString;
  description: LocalizedString;
}

// Answer option for a test
export interface TestAnswer {
  id: string;
  name: LocalizedString;
}

// Test within a level
export interface Test {
  id: string;
  levelId: string;
  order: number;
  title: LocalizedString;
  timerMode: 'countdown' | 'stopwatch' | 'none';
  timePerQuestion: number; // seconds, for countdown mode
  pointsPerCorrect: number;
  answerType: 'single' | 'multiple';
  answers: TestAnswer[]; // answers defined per test
  active?: boolean; // defaults to true for backward compat
}

// Image variant for cases
export interface CaseImage {
  url: string;
  type: 'polarized' | 'non-polarized';
}

// Annotation types for image overlays
export type AnnotationType = 'circle' | 'rect' | 'arrow';

export interface AnnotationCoords {
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  endX?: number;
  endY?: number;
}

export interface Annotation {
  type: AnnotationType;
  coords: AnnotationCoords;
  label: LocalizedString;
  color?: string;  // Optional for backward compatibility with legacy data
}

// Case/Question in a test
export interface Case {
  id: string;
  testId: string;
  order: number;
  images: CaseImage[];
  correctAnswers: string[]; // answer IDs (scoped to parent test)
  explanation: LocalizedString;
  features: LocalizedString[]; // bullet points
  differentials: LocalizedString[];
  pitfall: LocalizedString | null;
  annotations: Annotation[] | null;
}


// User permissions for community features
export interface UserPermissions {
  casesAccess: boolean;    // Can access community section
  moderator: boolean;      // Can flag/hide content
}

// User profile
export type UserRole = 'user' | 'admin';

export interface User {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  permissions?: UserPermissions;
  termsAcceptedAt?: Date;
  createdAt: Date;
}

// User's answer for a single case
export interface UserAnswer {
  caseId: string;
  selectedAnswers: string[];
  timeSpent: number; // seconds
  correct: boolean;
  timedOut: boolean;
}

// Test attempt
export interface TestAttempt {
  id: string;
  testId: string;
  userId: string;
  startedAt: Date;
  completedAt: Date | null;
  answers: UserAnswer[];
  score: number;
  accuracy: number; // percentage
}

// User progress summary
export interface UserProgress {
  testId: string;
  totalAttempts: number;
  bestScore: number;
  bestAccuracy: number;
  lastAttemptAt: Date;
}

// Aggregated user stats (for profile page)
export interface UserProgressStats {
  totalPoints: number;
  testsCompleted: number;
  totalAccuracySum: number;  // sum of all accuracies for calculating average
  totalTimeMs: number;       // total time spent in ms
  totalQuestions: number;    // total questions answered
  lastUpdatedAt: Date;
}

// Quiz state
export interface QuizState {
  testId: string;
  test: Test | null;
  cases: Case[];
  currentCaseIndex: number;
  answers: UserAnswer[];
  isLoading: boolean;
  imagesPreloaded: boolean;
}

// Community Case Image
export interface CommunityCaseImage {
  id: string;
  url: string;
  type: 'dermatoscopic' | 'macro' | 'other';
  order: number;
}

// Community Case
export type CommunityContentStatus = 'active' | 'flagged' | 'hidden';

export interface CommunityCase {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  description: string;
  images: CommunityCaseImage[];
  diagnosis?: {
    text: string;
    histopathologyResult?: string;
    addedAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
  commentsCount: number;
  status: CommunityContentStatus;
}

// Comment Annotation
export interface CommentAnnotationCoords {
  x: number;
  y: number;
  endX?: number;      // For arrows
  endY?: number;
  points?: { x: number; y: number }[];   // For freeform areas
  radius?: number;    // For circles
}

export interface CommentAnnotation {
  type: 'arrow' | 'area' | 'circle';
  coords: CommentAnnotationCoords;
  color: string;
  strokeStyle: 'solid' | 'dashed';
}

// Case Comment
export interface CaseComment {
  id: string;
  caseId: string;
  authorId: string;
  authorName: string;
  text: string;
  annotation?: {
    imageId: string;
    drawings: CommentAnnotation[];
  };
  parentCommentId?: string;
  createdAt: Date;
  status: CommunityContentStatus;
}

// Content Flag
export interface ContentFlag {
  id: string;
  contentType: 'case' | 'comment';
  contentId: string;
  caseId: string;
  reporterId: string;
  reporterName: string;
  reason: string;
  createdAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolution?: 'dismissed' | 'hidden';
}

// User Community Stats
export interface UserCommunityStats {
  userId: string;
  displayName: string;
  casesPosted: number;
  commentsPosted: number;
  diagnosesRevealed: number;
  lastActivityAt: Date;
}

// Leaderboard Entry
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  casesPosted: number;
  commentsPosted: number;
  totalContributions: number;
}

// Monthly Leaderboard
export interface MonthlyLeaderboard {
  month: string; // YYYY-MM format
  entries: LeaderboardEntry[];
  updatedAt: Date;
}

// Access Request for Community
export type AccessRequestStatus = 'pending' | 'approved' | 'rejected';

export interface AccessRequest {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  pwz?: string;  // Medical license number (Prawo Wykonywania Zawodu)
  description?: string;
  status: AccessRequestStatus;
  createdAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  rejectionReason?: string;
}

// Tournament
export interface Tournament {
  id: string;
  name: LocalizedString;
  testId: string;
  active: boolean;
  createdAt: Date;
  createdBy: string;
}

export interface TournamentAttempt {
  id: string;
  participantName: string;
  termsAcceptedAt: Date;
  startedAt: Date;
  completedAt: Date | null;
  answers: UserAnswer[];
  score: number;
  accuracy: number;
  totalTimeMs: number;
}

export interface TournamentRankingEntry {
  rank: number;
  participantName: string;
  score: number;
  accuracy: number;
  totalTimeMs: number;
  completedAt: Date;
}
