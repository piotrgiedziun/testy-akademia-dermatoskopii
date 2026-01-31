export interface TestLevel {
  id: string;
  order: number;
  title: {
    pl: string;
    en: string;
  };
  description: {
    pl: string;
    en: string;
  };
}

export const testLevels: TestLevel[] = [
  {
    id: "level-1",
    order: 1,
    title: {
      pl: "Poziom 1: Podstawy",
      en: "Level 1: Basics",
    },
    description: {
      pl: "Wprowadzenie do dermatoskopii",
      en: "Introduction to dermatoscopy",
    },
  },
  {
    id: "level-2",
    order: 2,
    title: {
      pl: "Poziom 2: Zaawansowany",
      en: "Level 2: Advanced",
    },
    description: {
      pl: "Zaawansowane techniki dermatoskopii",
      en: "Advanced dermatoscopy techniques",
    },
  },
];
