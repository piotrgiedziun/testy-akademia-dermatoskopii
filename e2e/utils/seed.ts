import { getAdminFirestore } from "./firebase-admin";
import { createTestUserFromFixture } from "./auth-helpers";
import { testUsers } from "../fixtures/test-data/users";
import { testLevels } from "../fixtures/test-data/levels";
import { testTests } from "../fixtures/test-data/tests";
import { testCases } from "../fixtures/test-data/cases";
import { testTournaments } from "../fixtures/test-data/tournaments";
import {
  LevelSchema,
  TestSchema,
  CaseSchema,
  TestUserSchema,
  validateFixtures,
} from "../fixtures/schemas";

export interface SeededData {
  userIds: Record<string, string>;
  levelIds: string[];
  testIds: string[];
  caseIds: string[];
}

export async function seedTestData(): Promise<SeededData> {
  // Validate all fixtures before seeding
  console.log("Validating fixtures...");
  validateFixtures(TestUserSchema, Object.values(testUsers), "testUsers");
  validateFixtures(LevelSchema, testLevels, "testLevels");
  validateFixtures(TestSchema, testTests, "testTests");
  validateFixtures(CaseSchema, testCases, "testCases");
  console.log("All fixtures valid!");

  const db = getAdminFirestore();
  const seededData: SeededData = {
    userIds: {},
    levelIds: [],
    testIds: [],
    caseIds: [],
  };

  // Seed users
  for (const user of Object.values(testUsers)) {
    const uid = await createTestUserFromFixture(user);
    seededData.userIds[user.email] = uid;
  }

  // Seed levels
  for (const level of testLevels) {
    const levelRef = db.collection("levels").doc(level.id);
    await levelRef.set({
      order: level.order,
      title: level.title,
      description: level.description,
    });
    seededData.levelIds.push(level.id);
  }

  // Seed tests
  for (const test of testTests) {
    const testRef = db.collection("tests").doc(test.id);
    await testRef.set({
      levelId: test.levelId,
      order: test.order,
      title: test.title,
      timerMode: test.timerMode,
      timePerQuestion: test.timePerQuestion,
      pointsPerCorrect: test.pointsPerCorrect,
      answerType: test.answerType,
      answers: test.answers,
      active: true,
    });
    seededData.testIds.push(test.id);
  }

  // Seed cases
  for (const caseData of testCases) {
    const caseRef = db.collection("cases").doc(caseData.id);
    await caseRef.set({
      testId: caseData.testId,
      order: caseData.order,
      images: caseData.images,
      correctAnswers: caseData.correctAnswers,
      explanation: caseData.explanation,
      features: caseData.features || [],
      differentials: caseData.differentials || [],
      pitfall: caseData.pitfall || null,
      annotations: caseData.annotations || [],
    });
    seededData.caseIds.push(caseData.id);
  }

  // Seed tournaments
  for (const tournament of testTournaments) {
    const tournamentRef = db.collection("tournaments").doc(tournament.id);
    await tournamentRef.set({
      name: tournament.name,
      testId: tournament.testId,
      active: tournament.active,
      createdBy: tournament.createdBy,
      createdAt: new Date(),
    });
  }

  console.log("Test data seeded successfully");
  return seededData;
}

export async function seedCommunityData(authorId: string, authorName: string): Promise<string[]> {
  const db = getAdminFirestore();
  const caseIds: string[] = [];

  // Create community cases
  const communityCases = [
    {
      id: "community-case-1",
      title: "Przypadek dermatoskopowy #1",
      description: "Interesujący przypadek do omówienia - proszę o opinię.",
      images: [
        {
          id: "img-1",
          url: "https://placehold.co/400x400/png?text=Case1",
          type: "dermatoscopic" as const,
          order: 0,
        },
      ],
      diagnosis: {
        text: "Znamię melanocytowe",
        addedAt: new Date(),
      },
    },
    {
      id: "community-case-2",
      title: "Przypadek dermatoskopowy #2",
      description: "Przypadek z trudną diagnostyką różnicową.",
      images: [
        {
          id: "img-2",
          url: "https://placehold.co/400x400/png?text=Case2",
          type: "dermatoscopic" as const,
          order: 0,
        },
      ],
      diagnosis: {
        text: "Rogowacenie słoneczne",
        addedAt: new Date(),
      },
    },
  ];

  for (const communityCase of communityCases) {
    const caseRef = db.collection("communityCases").doc(communityCase.id);
    await caseRef.set({
      authorId,
      authorName,
      title: communityCase.title,
      description: communityCase.description,
      images: communityCase.images,
      diagnosis: communityCase.diagnosis,
      createdAt: new Date(),
      updatedAt: new Date(),
      commentsCount: 0,
      status: "active" as const,
    });
    caseIds.push(communityCase.id);

    // Add a comment to the first case
    if (communityCase.id === "community-case-1") {
      await caseRef.collection("comments").doc("comment-1").set({
        authorId,
        authorName,
        text: "To jest komentarz testowy",
        annotation: null,
        parentCommentId: null,
        createdAt: new Date(),
        status: "active",
      });

      // Update comments count
      await caseRef.update({ commentsCount: 1 });
    }
  }

  // Update user community stats
  await db.collection("userCommunityStats").doc(authorId).set({
    displayName: authorName,
    casesPosted: communityCases.length,
    commentsPosted: 1,
    diagnosesRevealed: 0,
    lastActivityAt: new Date(),
  });

  console.log("Community data seeded successfully");
  return caseIds;
}

export async function seedAccessRequest(
  userId: string,
  userEmail: string,
  userName: string,
  status: "pending" | "approved" | "rejected" = "pending"
): Promise<string> {
  const db = getAdminFirestore();
  const requestId = `request-${userId}`;

  await db.collection("accessRequests").doc(requestId).set({
    userId,
    userEmail,
    userName,
    pwz: "1234567",
    description: "Test access request",
    status,
    createdAt: new Date(),
    reviewedAt: status !== "pending" ? new Date() : null,
    reviewedBy: status !== "pending" ? "admin" : null,
    rejectionReason: status === "rejected" ? "Test rejection" : null,
  });

  return requestId;
}

export async function seedContentFlag(
  reporterId: string,
  reporterName: string,
  contentType: "case" | "comment",
  contentId: string,
  caseId: string
): Promise<string> {
  const db = getAdminFirestore();
  const flagId = `flag-${contentId}`;

  await db.collection("contentFlags").doc(flagId).set({
    contentType,
    contentId,
    caseId,
    reporterId,
    reporterName,
    reason: "Inappropriate content",
    createdAt: new Date(),
    resolvedAt: null,
    resolution: null,
  });

  return flagId;
}
