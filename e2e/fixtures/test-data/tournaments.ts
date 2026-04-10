export interface TestTournament {
  id: string;
  name: {
    pl: string;
    en: string;
  };
  testId: string;
  active: boolean;
  createdBy: string;
}

export const testTournaments: TestTournament[] = [
  {
    id: "tournament-active",
    name: {
      pl: "Turniej testowy",
      en: "Test tournament",
    },
    testId: "test-no-timer",
    active: true,
    createdBy: "admin",
  },
  {
    id: "tournament-inactive",
    name: {
      pl: "Turniej nieaktywny",
      en: "Inactive tournament",
    },
    testId: "test-no-timer",
    active: false,
    createdBy: "admin",
  },
  {
    id: "tournament-countdown",
    name: {
      pl: "Turniej z odliczaniem",
      en: "Countdown tournament",
    },
    testId: "test-short-timer",
    active: true,
    createdBy: "admin",
  },
];
