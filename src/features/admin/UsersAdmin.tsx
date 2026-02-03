import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Button, Input, Loading } from '@/components/ui';
import { getAllUsers, updateUserPermissions, updateUserRole } from '@/services/firebase/communityFirestore';
import { useAuthStore } from '@/stores';
import type { User } from '@/types';

export function UsersAdmin() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      const data = await getAllUsers();
      setUsers(data);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleToggleCasesAccess = async (user: User) => {
    setUpdatingUserId(user.uid);
    try {
      const newValue = !user.permissions?.casesAccess;
      await updateUserPermissions(user.uid, { casesAccess: newValue });
      setUsers((prev) =>
        prev.map((u) =>
          u.uid === user.uid
            ? { ...u, permissions: { ...u.permissions!, casesAccess: newValue } }
            : u
        )
      );
    } catch (error) {
      console.error('Error updating permissions:', error);
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleToggleModerator = async (user: User) => {
    setUpdatingUserId(user.uid);
    try {
      const newValue = !user.permissions?.moderator;
      await updateUserPermissions(user.uid, { moderator: newValue });
      setUsers((prev) =>
        prev.map((u) =>
          u.uid === user.uid
            ? { ...u, permissions: { ...u.permissions!, moderator: newValue } }
            : u
        )
      );
    } catch (error) {
      console.error('Error updating permissions:', error);
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleToggleAdmin = async (user: User) => {
    // Prevent self-demotion
    if (user.uid === currentUser?.uid) {
      return;
    }

    setUpdatingUserId(user.uid);
    try {
      const newRole = user.role === 'admin' ? 'user' : 'admin';
      await updateUserRole(user.uid, newRole);
      setUsers((prev) =>
        prev.map((u) =>
          u.uid === user.uid ? { ...u, role: newRole } : u
        )
      );
    } catch (error) {
      console.error('Error updating role:', error);
    } finally {
      setUpdatingUserId(null);
    }
  };

  const filteredUsers = users.filter(
    (user) =>
      user.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return <Loading size="lg" text={t('common.loading')} />;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-charcoal">{t('admin.users')}</h1>
      </div>

      <div className="mb-6">
        <Input
          placeholder={t('common.search')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="space-y-3">
        {filteredUsers.map((user) => (
          <Card key={user.uid} data-testid="admin-user-row">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-lg">
                      {user.displayName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-charcoal">{user.displayName}</h3>
                    <p className="text-sm text-gray-500">{user.email}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant={user.role === 'admin' ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => handleToggleAdmin(user)}
                  disabled={updatingUserId === user.uid || user.uid === currentUser?.uid}
                  data-testid="admin-toggle"
                  title={user.uid === currentUser?.uid ? t('admin.cannotDemoteSelf') : undefined}
                >
                  {user.role === 'admin' ? t('admin.isAdmin') : t('admin.makeAdmin')}
                </Button>

                <Button
                  variant={user.permissions?.casesAccess ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => handleToggleCasesAccess(user)}
                  disabled={updatingUserId === user.uid}
                  data-testid="cases-access-toggle"
                >
                  {user.permissions?.casesAccess
                    ? t('community.hasAccess')
                    : t('community.grantAccess')}
                </Button>

                <Button
                  variant={user.permissions?.moderator ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => handleToggleModerator(user)}
                  disabled={updatingUserId === user.uid}
                  data-testid="moderator-toggle"
                >
                  {user.permissions?.moderator
                    ? t('community.isModerator')
                    : t('community.makeModerator')}
                </Button>
              </div>
            </div>
          </Card>
        ))}

        {filteredUsers.length === 0 && (
          <Card>
            <p className="text-center text-gray-500">{t('common.noResults')}</p>
          </Card>
        )}
      </div>

      <div className="mt-6 text-sm text-gray-500">
        {t('community.totalUsers')}: {users.length}
      </div>
    </div>
  );
}
