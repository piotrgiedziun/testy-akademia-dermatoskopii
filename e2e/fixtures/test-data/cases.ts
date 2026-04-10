export interface TestCase {
  id: string;
  testId: string;
  order: number;
  images: Array<{
    url: string;
    type: "polarized" | "non-polarized";
  }>;
  correctAnswers: string[];
  explanation: {
    pl: string;
    en: string;
  };
  features?: Array<{
    pl: string;
    en: string;
  }>;
  differentials?: Array<{
    pl: string;
    en: string;
  }>;
  pitfall?: {
    pl: string;
    en: string;
  } | null;
  annotations?: Array<{
    type: "circle" | "rect" | "arrow";
    coords: {
      x: number;
      y: number;
      width?: number;
      height?: number;
      radius?: number;
      endX?: number;
      endY?: number;
    };
    label: { pl: string; en: string };
  }> | null;
}

export const testCases: TestCase[] = [
  // Cases for test-no-timer
  {
    id: "case-1",
    testId: "test-no-timer",
    order: 1,
    images: [
      {
        url: "https://placehold.co/600x400/png?text=Case1",
        type: "polarized",
      },
    ],
    correctAnswers: ["a1"],
    explanation: {
      pl: "To jest znamię melanocytowe - typowe cechy to regularna siatka pigmentowa.",
      en: "This is a melanocytic nevus - typical features include regular pigment network.",
    },
    features: [
      { pl: "Regularna siatka pigmentowa", en: "Regular pigment network" },
      { pl: "Symetryczny kształt", en: "Symmetric shape" },
    ],
    differentials: [
      { pl: "Czerniak (ale brak cech atypowych)", en: "Melanoma (but no atypical features)" },
    ],
    pitfall: null,
    annotations: null,
  },
  {
    id: "case-2",
    testId: "test-no-timer",
    order: 2,
    images: [
      {
        url: "https://placehold.co/600x400/png?text=Case2",
        type: "polarized",
      },
    ],
    correctAnswers: ["a2"],
    explanation: {
      pl: "To jest czerniak - widoczne są cechy ABCDE.",
      en: "This is melanoma - ABCDE features are visible.",
    },
    features: [
      { pl: "Asymetria", en: "Asymmetry" },
      { pl: "Nieregularne granice", en: "Irregular borders" },
      { pl: "Wielobarwność", en: "Color variation" },
    ],
    differentials: [],
    pitfall: {
      pl: "Może być mylony ze znamieniem atypowym",
      en: "May be confused with atypical nevus",
    },
    annotations: null,
  },

  // Cases for test-countdown
  {
    id: "case-3",
    testId: "test-countdown",
    order: 1,
    images: [
      {
        url: "https://placehold.co/600x400/png?text=Case3",
        type: "polarized",
      },
    ],
    correctAnswers: ["a3"],
    explanation: {
      pl: "To jest rogowacenie słoneczne - widoczna struktura pseudosieci.",
      en: "This is actinic keratosis - pseudonetwork structure visible.",
    },
    features: [
      { pl: "Pseudosieć", en: "Pseudonetwork" },
      { pl: "Łuskowatość", en: "Scale" },
    ],
    differentials: [],
    pitfall: null,
    annotations: null,
  },
  {
    id: "case-4",
    testId: "test-countdown",
    order: 2,
    images: [
      {
        url: "https://placehold.co/600x400/png?text=Case4",
        type: "polarized",
      },
    ],
    correctAnswers: ["a4"],
    explanation: {
      pl: "To jest brodawka łojotokowa - typowe cysty rogowe.",
      en: "This is seborrheic keratosis - typical horn cysts.",
    },
    features: [
      { pl: "Cysty rogowe", en: "Horn cysts" },
      { pl: "Kryptonowe otwory", en: "Crypts and fissures" },
    ],
    differentials: [],
    pitfall: null,
    annotations: null,
  },

  // Cases for test-stopwatch (multiple answers)
  {
    id: "case-5",
    testId: "test-stopwatch",
    order: 1,
    images: [
      {
        url: "https://placehold.co/600x400/png?text=Case5",
        type: "polarized",
      },
      {
        url: "https://placehold.co/600x400/png?text=Case5Macro",
        type: "non-polarized",
      },
    ],
    correctAnswers: ["a1", "a4"],
    explanation: {
      pl: "Ten przypadek pokazuje cechy zarówno znamienia melanocytowego jak i brodawki łojotokowej.",
      en: "This case shows features of both melanocytic nevus and seborrheic keratosis.",
    },
    features: [
      { pl: "Mieszane cechy", en: "Mixed features" },
    ],
    differentials: [
      { pl: "Czerniak", en: "Melanoma" },
    ],
    pitfall: {
      pl: "Nakładające się struktury mogą być mylące",
      en: "Overlapping structures can be confusing",
    },
    annotations: null,
  },
  {
    id: "case-6",
    testId: "test-stopwatch",
    order: 2,
    images: [
      {
        url: "https://placehold.co/600x400/png?text=Case6",
        type: "polarized",
      },
    ],
    correctAnswers: ["a5"],
    explanation: {
      pl: "To jest rak podstawnokomórkowy - widoczne teleangiektazje i owrzodzenie.",
      en: "This is basal cell carcinoma - telangiectasia and ulceration visible.",
    },
    features: [
      { pl: "Teleangiektazje", en: "Telangiectasia" },
      { pl: "Owrzodzenie", en: "Ulceration" },
      { pl: "Błyszcząca powierzchnia", en: "Shiny surface" },
    ],
    differentials: [],
    pitfall: null,
    annotations: null,
  },

  // Cases for test-short-timer (3s countdown)
  {
    id: "case-7",
    testId: "test-short-timer",
    order: 1,
    images: [
      {
        url: "https://placehold.co/600x400/png?text=ShortTimer1",
        type: "polarized",
      },
    ],
    correctAnswers: ["a1"],
    explanation: {
      pl: "Przypadek 1 z krótkim timerem.",
      en: "Short timer case 1.",
    },
    features: [],
    differentials: [],
    pitfall: null,
    annotations: null,
  },
  {
    id: "case-8",
    testId: "test-short-timer",
    order: 2,
    images: [
      {
        url: "https://placehold.co/600x400/png?text=ShortTimer2",
        type: "polarized",
      },
    ],
    correctAnswers: ["a2"],
    explanation: {
      pl: "Przypadek 2 z krótkim timerem.",
      en: "Short timer case 2.",
    },
    features: [],
    differentials: [],
    pitfall: null,
    annotations: null,
  },
];
