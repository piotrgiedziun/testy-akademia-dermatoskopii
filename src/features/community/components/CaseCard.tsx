import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui';
import type { CommunityCase } from '@/types';

interface CaseCardProps {
  case_: CommunityCase;
}

export function CaseCard({ case_ }: CaseCardProps) {
  const { t } = useTranslation();

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('default', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
  };

  const primaryImage = case_.images.find((img) => img.type === 'dermatoscopic') || case_.images[0];

  return (
    <Link to={`/community/case/${case_.id}`} data-testid="community-case-card">
      <Card hoverable className="overflow-hidden">
        <div className="flex gap-4">
          {primaryImage && (
            <div className="w-32 h-32 flex-shrink-0">
              <img
                src={primaryImage.url}
                alt={case_.title}
                className="w-full h-full object-cover rounded-lg"
              />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-charcoal text-lg truncate">{case_.title}</h3>

            <p className="text-sm text-gray-500 mt-1">
              {t('community.by')} {case_.authorName} &bull; {formatDate(case_.createdAt)}
            </p>

            <p className="text-gray-600 mt-2 line-clamp-2">{case_.description}</p>

            <div className="flex items-center gap-4 mt-3">
              <span className="text-sm text-gray-500 flex items-center gap-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z"
                    clipRule="evenodd"
                  />
                </svg>
                {case_.commentsCount}
              </span>

              <span className="text-sm text-gray-500 flex items-center gap-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" />
                </svg>
                {case_.images.length}
              </span>

              {case_.diagnosis && (
                <span className="text-sm text-primary font-medium">
                  {t('community.hasDiagnosis')}
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
