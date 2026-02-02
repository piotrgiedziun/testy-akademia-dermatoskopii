import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

/**
 * Firestore trigger that syncs the 'admin' custom claim with the user's role field.
 * This ensures Storage rules can verify admin status via request.auth.token.admin.
 */
export const onUserRoleChange = functions.firestore.onDocumentWritten(
  'users/{userId}',
  async (event) => {
    const userId = event.params.userId;
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();

    const beforeRole = beforeData?.role;
    const afterRole = afterData?.role;

    // No role change - nothing to do
    if (beforeRole === afterRole) {
      return null;
    }

    const auth = admin.auth();

    if (afterRole === 'admin') {
      // User became admin - set the custom claim
      await auth.setCustomUserClaims(userId, { admin: true });
      functions.logger.info(`Set admin claim for user ${userId}`);
    } else if (beforeRole === 'admin') {
      // User was admin but no longer is - remove the claim
      try {
        const user = await auth.getUser(userId);
        const claims = { ...user.customClaims };
        delete claims.admin;
        await auth.setCustomUserClaims(userId, claims);
        functions.logger.info(`Removed admin claim for user ${userId}`);
      } catch (error) {
        // User might have been deleted
        functions.logger.warn(`Could not update claims for user ${userId}:`, error);
      }
    }

    return null;
  }
);
