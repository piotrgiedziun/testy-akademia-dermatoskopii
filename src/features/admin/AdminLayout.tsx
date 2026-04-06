import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Layout } from '@/components/layout';
import { useAuthStore } from '@/stores';

export function AdminLayout() {
  const { t } = useTranslation();
  const { user } = useAuthStore();

  if (!user || user.role !== 'admin') {
    return <Navigate to="/levels" replace />;
  }

  const navItems = [
    { to: '/admin', label: t('admin.dashboard'), end: true },
    { to: '/admin/levels', label: t('admin.levels') },
    { to: '/admin/tests', label: t('admin.tests') },
    { to: '/admin/cases', label: t('admin.cases') },
    { to: '/admin/users', label: t('admin.users') },
    { to: '/admin/moderation', label: t('admin.moderation') },
    { to: '/admin/access-requests', label: t('admin.accessRequests') },
    { to: '/admin/tournaments', label: t('admin.tournaments') },
  ];

  return (
    <Layout fullWidth>
      <div className="flex min-h-[calc(100vh-4rem)]">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-gray-200 p-4 hidden md:block">
          <h2 className="text-lg font-semibold text-charcoal mb-4">
            {t('admin.title')}
          </h2>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `block px-3 py-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Mobile nav */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-inset-bottom z-40">
          <nav className="flex justify-around py-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                    isActive ? 'text-primary' : 'text-gray-500'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Main content */}
        <main className="flex-1 p-6 pb-20 md:pb-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </Layout>
  );
}
