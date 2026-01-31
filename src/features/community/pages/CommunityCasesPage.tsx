import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { Button, Loading, Card } from "@/components/ui";
import { CaseCard } from "../components";
import { AccessRequestPage } from "./AccessRequestPage";
import { getCommunityCases } from "@/services/firebase/communityFirestore";
import { useAuthStore } from "@/stores";
import type { CommunityCase } from "@/types";
import type { DocumentSnapshot } from "firebase/firestore";

export function CommunityCasesPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();

  // Check if user has access
  const hasAccess = user?.role === 'admin' || user?.permissions?.casesAccess;

  // If user doesn't have access, show access request page
  if (!hasAccess) {
    return <AccessRequestPage />;
  }
  const [cases, setCases] = useState<CommunityCase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const fetchCases = useCallback(
    async (loadMore = false) => {
      if (loadMore) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      try {
        const result = await getCommunityCases(
          10,
          loadMore ? lastDoc || undefined : undefined
        );
        if (loadMore) {
          setCases((prev) => [...prev, ...result.cases]);
        } else {
          setCases(result.cases);
        }
        setLastDoc(result.lastDoc);
        setHasMore(result.cases.length === 10);
      } catch (error) {
        console.error("Error fetching cases:", error);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [lastDoc]
  );

  useEffect(() => {
    fetchCases();
  }, []);

  if (isLoading) {
    return (
      <Layout>
        <Loading size="lg" text={t("common.loading")} />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-charcoal">
              {t("community.title")}
            </h1>
            <p className="text-gray-600 mt-1">{t("community.subtitle")}</p>
          </div>

          <div className="flex gap-3">
            <Link to="/community/leaderboard">
              <Button variant="outline">{t("community.leaderboard")}</Button>
            </Link>
            <Link to="/community/create">
              <Button>{t("community.createCase")}</Button>
            </Link>
          </div>
        </div>

        {/* Cases list */}
        {cases.length > 0 ? (
          <div className="space-y-4">
            {cases.map((case_) => (
              <CaseCard key={case_.id} case_={case_} />
            ))}

            {hasMore && (
              <div className="text-center pt-4">
                <Button
                  variant="outline"
                  onClick={() => fetchCases(true)}
                  disabled={isLoadingMore}
                  isLoading={isLoadingMore}
                >
                  {t("community.loadMore")}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <Card>
            <div className="text-center py-12">
              <h3 className="text-lg font-medium text-charcoal mb-2">
                {t("community.noCases")}
              </h3>
              <p className="text-gray-500 mb-4">{t("community.beFirst")}</p>
              <Link to="/community/create">
                <Button>{t("community.createCase")}</Button>
              </Link>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
}
