export interface TestUser {
  email: string;
  password: string;
  displayName: string;
  role: "user" | "admin";
  permissions: {
    casesAccess?: boolean;
    moderator?: boolean;
  };
  termsAcceptedAt: boolean;
}

export const testUsers: Record<string, TestUser> = {
  regular: {
    email: "regular@test.com",
    password: "password",
    displayName: "Regular User",
    role: "user",
    permissions: {},
    termsAcceptedAt: true,
  },
  community: {
    email: "community@test.com",
    password: "password",
    displayName: "Community User",
    role: "user",
    permissions: {
      casesAccess: true,
    },
    termsAcceptedAt: true,
  },
  moderator: {
    email: "moderator@test.com",
    password: "password",
    displayName: "Moderator User",
    role: "user",
    permissions: {
      casesAccess: true,
      moderator: true,
    },
    termsAcceptedAt: true,
  },
  admin: {
    email: "admin@test.com",
    password: "password",
    displayName: "Admin User",
    role: "admin",
    permissions: {
      casesAccess: true,
      moderator: true,
    },
    termsAcceptedAt: true,
  },
  noTerms: {
    email: "noterms@test.com",
    password: "password",
    displayName: "No Terms User",
    role: "user",
    permissions: {},
    termsAcceptedAt: false,
  },
};
