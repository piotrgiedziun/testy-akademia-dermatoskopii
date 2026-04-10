export interface TestTest {
  id: string;
  levelId: string;
  order: number;
  title: {
    pl: string;
    en: string;
  };
  timerMode: "none" | "countdown" | "stopwatch";
  timePerQuestion: number;
  pointsPerCorrect: number;
  answerType: "single" | "multiple";
  answers: Array<{
    id: string;
    name: {
      pl: string;
      en: string;
    };
  }>;
}

export const testTests: TestTest[] = [
  {
    id: "test-no-timer",
    levelId: "level-1",
    order: 1,
    title: {
      pl: "Test bez timera",
      en: "Test without timer",
    },
    timerMode: "none",
    timePerQuestion: 0,
    pointsPerCorrect: 10,
    answerType: "single",
    answers: [
      { id: "a1", name: { pl: "Znamię melanocytowe", en: "Melanocytic nevus" } },
      { id: "a2", name: { pl: "Czerniak", en: "Melanoma" } },
      { id: "a3", name: { pl: "Rogowacenie słoneczne", en: "Actinic keratosis" } },
      { id: "a4", name: { pl: "Brodawka łojotokowa", en: "Seborrheic keratosis" } },
    ],
  },
  {
    id: "test-countdown",
    levelId: "level-1",
    order: 2,
    title: {
      pl: "Test z odliczaniem",
      en: "Test with countdown",
    },
    timerMode: "countdown",
    timePerQuestion: 30,
    pointsPerCorrect: 15,
    answerType: "single",
    answers: [
      { id: "a1", name: { pl: "Znamię melanocytowe", en: "Melanocytic nevus" } },
      { id: "a2", name: { pl: "Czerniak", en: "Melanoma" } },
      { id: "a3", name: { pl: "Rogowacenie słoneczne", en: "Actinic keratosis" } },
      { id: "a4", name: { pl: "Brodawka łojotokowa", en: "Seborrheic keratosis" } },
    ],
  },
  {
    id: "test-stopwatch",
    levelId: "level-2",
    order: 1,
    title: {
      pl: "Test ze stoperem",
      en: "Test with stopwatch",
    },
    timerMode: "stopwatch",
    timePerQuestion: 0,
    pointsPerCorrect: 20,
    answerType: "multiple",
    answers: [
      { id: "a1", name: { pl: "Znamię melanocytowe", en: "Melanocytic nevus" } },
      { id: "a2", name: { pl: "Czerniak", en: "Melanoma" } },
      { id: "a3", name: { pl: "Rogowacenie słoneczne", en: "Actinic keratosis" } },
      { id: "a4", name: { pl: "Brodawka łojotokowa", en: "Seborrheic keratosis" } },
      { id: "a5", name: { pl: "Rak podstawnokomórkowy", en: "Basal cell carcinoma" } },
    ],
  },
  {
    id: "test-short-timer",
    levelId: "level-1",
    order: 3,
    title: {
      pl: "Test z krótkim timerem",
      en: "Test with short timer",
    },
    timerMode: "countdown",
    timePerQuestion: 3,
    pointsPerCorrect: 10,
    answerType: "single",
    answers: [
      { id: "a1", name: { pl: "Znamię melanocytowe", en: "Melanocytic nevus" } },
      { id: "a2", name: { pl: "Czerniak", en: "Melanoma" } },
    ],
  },
];
