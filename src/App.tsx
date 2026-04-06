import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { ReCaptchaProvider } from '@/components/ReCaptchaProvider';
import { Loading, TermsModal } from '@/components/ui';

// Pages
import { HomePage } from '@/features/home';
import { LoginPage, RegisterPage, ProfilePage } from '@/features/auth';
import { LevelsPage, TestsPage } from '@/features/courses';
import { QuizPage } from '@/features/quiz';
import { ResultsPage } from '@/features/results';
import {
  AdminLayout,
  AdminDashboard,
  LevelsAdmin,
  TestsAdmin,
  CasesAdmin,
  UsersAdmin,
  ModerationDashboard,
  AccessRequestsAdmin,
  TournamentsAdmin,
} from '@/features/admin';
import {
  CommunityCasesPage,
  CaseDetailPage,
  CreateCasePage,
  EditCasePage,
  UserProfilePage,
  LeaderboardPage,
} from '@/features/community';
import { TermsPage, PrivacyPolicyPage } from '@/features/legal';
import {
  TournamentEntryPage,
  TournamentQuizPage,
  TournamentResultsPage,
  TournamentRankingPage,
} from '@/features/tournament';

function App() {
  const { initialize, isInitialized, user, acceptTerms, logout } = useAuthStore();

  useEffect(() => {
    const unsubscribe = initialize();
    return unsubscribe;
  }, [initialize]);

  if (!isInitialized) {
    return <Loading fullScreen />;
  }

  // Show terms modal if user is logged in but hasn't accepted terms
  const needsTermsAcceptance = user && !user.termsAcceptedAt;

  const handleAcceptTerms = async () => {
    await acceptTerms();
  };

  const handleDeclineTerms = async () => {
    await logout();
  };

  return (
    <BrowserRouter>
      <TermsModal
        isOpen={needsTermsAcceptance || false}
        onAccept={handleAcceptTerms}
        onDecline={handleDeclineTerms}
      />
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<ReCaptchaProvider><LoginPage /></ReCaptchaProvider>} />
        <Route path="/register" element={<ReCaptchaProvider><RegisterPage /></ReCaptchaProvider>} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />

        {/* Tournament routes (public, no auth required) */}
        <Route path="/tournament/:uuid" element={<TournamentEntryPage />} />
        <Route path="/tournament/:uuid/quiz" element={<TournamentQuizPage />} />
        <Route path="/tournament/:uuid/results/:attemptId" element={<TournamentResultsPage />} />
        <Route path="/tournament/:uuid/ranking" element={<TournamentRankingPage />} />

        {/* Protected routes */}
        <Route
          path="/levels"
          element={
            <ProtectedRoute>
              <LevelsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/levels/:levelId"
          element={
            <ProtectedRoute>
              <TestsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/quiz/:testId"
          element={
            <ProtectedRoute>
              <QuizPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/results/:attemptId"
          element={
            <ProtectedRoute>
              <ResultsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />

        {/* Community routes */}
        <Route
          path="/community"
          element={
            <ProtectedRoute>
              <CommunityCasesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/community/case/:caseId"
          element={
            <ProtectedRoute requireCasesAccess>
              <CaseDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/community/create"
          element={
            <ProtectedRoute requireCasesAccess>
              <CreateCasePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/community/case/:caseId/edit"
          element={
            <ProtectedRoute requireCasesAccess>
              <EditCasePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/community/user/:userId"
          element={
            <ProtectedRoute requireCasesAccess>
              <UserProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/community/leaderboard"
          element={
            <ProtectedRoute requireCasesAccess>
              <LeaderboardPage />
            </ProtectedRoute>
          }
        />

        {/* Admin routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute requireAdmin>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="levels" element={<LevelsAdmin />} />
          <Route path="tests" element={<TestsAdmin />} />
          <Route path="cases" element={<CasesAdmin />} />
          <Route path="users" element={<UsersAdmin />} />
          <Route path="moderation" element={<ModerationDashboard />} />
          <Route path="access-requests" element={<AccessRequestsAdmin />} />
          <Route path="tournaments" element={<TournamentsAdmin />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<HomePage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
