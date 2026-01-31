import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;

if (!projectId) {
  console.error('❌ Error: FIREBASE_PROJECT_ID environment variable is required');
  console.error('   Set it with: export FIREBASE_PROJECT_ID=your-project-id');
  process.exit(1);
}

// Use application default credentials (from gcloud auth application-default login)
initializeApp({
  credential: applicationDefault(),
  projectId,
});

const db = getFirestore();

// Answers for tests (previously global diagnoses, now per-test)
const testAnswers = {
  'test-1-1': [
    { id: 'melanoma', name: { pl: 'Czerniak', en: 'Melanoma' } },
    { id: 'bcc', name: { pl: 'Rak podstawnokomórkowy', en: 'Basal Cell Carcinoma' } },
    { id: 'scc', name: { pl: 'Rak kolczystokomórkowy', en: 'Squamous Cell Carcinoma' } },
    { id: 'nevus', name: { pl: 'Znamię melanocytowe', en: 'Melanocytic Nevus' } },
    { id: 'seborrheic-keratosis', name: { pl: 'Rogowacenie łojotokowe', en: 'Seborrheic Keratosis' } },
    { id: 'dermatofibroma', name: { pl: 'Włókniak twardy skóry', en: 'Dermatofibroma' } },
    { id: 'hemangioma', name: { pl: 'Naczyniak', en: 'Hemangioma' } },
  ],
  'test-1-2': [
    { id: 'melanoma', name: { pl: 'Czerniak', en: 'Melanoma' } },
    { id: 'bcc', name: { pl: 'Rak podstawnokomórkowy', en: 'Basal Cell Carcinoma' } },
    { id: 'nevus', name: { pl: 'Znamię melanocytowe', en: 'Melanocytic Nevus' } },
    { id: 'dermatofibroma', name: { pl: 'Włókniak twardy skóry', en: 'Dermatofibroma' } },
    { id: 'actinic-keratosis', name: { pl: 'Rogowacenie słoneczne', en: 'Actinic Keratosis' } },
  ],
  'test-2-1': [
    { id: 'melanoma', name: { pl: 'Czerniak', en: 'Melanoma' } },
    { id: 'nevus', name: { pl: 'Znamię melanocytowe', en: 'Melanocytic Nevus' } },
    { id: 'dysplastic-nevus', name: { pl: 'Znamię dysplastyczne', en: 'Dysplastic Nevus' } },
    { id: 'lentigo', name: { pl: 'Plama soczewicowata', en: 'Lentigo' } },
  ],
};

// Sample level
const levels = [
  {
    id: 'level-1',
    order: 1,
    title: { pl: 'Podstawy dermatoskopii', en: 'Dermoscopy Basics' },
    description: {
      pl: 'Poznaj podstawowe struktury dermatoskopowe i naucz się rozpoznawać najczęstsze zmiany skórne.',
      en: 'Learn basic dermoscopic structures and recognize common skin lesions.'
    },
  },
  {
    id: 'level-2',
    order: 2,
    title: { pl: 'Zmiany melanocytowe', en: 'Melanocytic Lesions' },
    description: {
      pl: 'Naucz się różnicować zmiany melanocytowe - od łagodnych znamion po czerniaka.',
      en: 'Learn to differentiate melanocytic lesions - from benign nevi to melanoma.'
    },
  },
];

// Sample tests with answers embedded
const tests = [
  {
    id: 'test-1-1',
    levelId: 'level-1',
    order: 1,
    title: { pl: 'Rozpoznawanie podstawowych struktur', en: 'Recognizing Basic Structures' },
    timerMode: 'none' as const,
    timePerQuestion: 0,
    pointsPerCorrect: 10,
    answerType: 'single' as const,
    answers: testAnswers['test-1-1'],
  },
  {
    id: 'test-1-2',
    levelId: 'level-1',
    order: 2,
    title: { pl: 'Test z limitem czasu', en: 'Timed Test' },
    timerMode: 'countdown' as const,
    timePerQuestion: 30,
    pointsPerCorrect: 15,
    answerType: 'single' as const,
    answers: testAnswers['test-1-2'],
  },
  {
    id: 'test-2-1',
    levelId: 'level-2',
    order: 1,
    title: { pl: 'Znamiona łagodne vs dysplastyczne', en: 'Benign vs Dysplastic Nevi' },
    timerMode: 'stopwatch' as const,
    timePerQuestion: 0,
    pointsPerCorrect: 20,
    answerType: 'single' as const,
    answers: testAnswers['test-2-1'],
  },
];

// Sample cases (using placeholder images for now)
const cases = [
  {
    id: 'case-1-1-1',
    testId: 'test-1-1',
    order: 1,
    images: [
      { url: 'https://pwrstuff.s3.eu-central-1.amazonaws.com/1/D30+zoomed+polarized.JPG', type: 'polarized' as const },
    ],
    correctAnswers: ['seborrheic-keratosis'],
    explanation: {
      pl: 'Rogowacenie łojotokowe charakteryzuje się obecnością pseudocyst rogowych (milia-like cysts) i szczelin rogowych (comedo-like openings). Zmiana ma wyraźne granice i wygląd "przyklejony" do skóry.',
      en: 'Seborrheic keratosis is characterized by milia-like cysts and comedo-like openings. The lesion has well-defined borders and a "stuck-on" appearance.',
    },
    features: [
      { pl: 'Pseudocysty rogowe (milia-like cysts)', en: 'Milia-like cysts' },
      { pl: 'Szczeliny rogowe (comedo-like openings)', en: 'Comedo-like openings' },
      { pl: 'Wyraźne granice', en: 'Well-defined borders' },
    ],
    differentials: [
      { pl: 'Czerniak amelanotyczny', en: 'Amelanotic melanoma' },
      { pl: 'Rak podstawnokomórkowy', en: 'Basal cell carcinoma' },
    ],
    pitfall: {
      pl: 'Ciemne rogowacenie łojotokowe może imitować czerniaka - szukaj typowych struktur SK.',
      en: 'Dark seborrheic keratosis can mimic melanoma - look for typical SK structures.',
    },
    annotations: null,
  },
  {
    id: 'case-1-1-2',
    testId: 'test-1-1',
    order: 2,
    images: [
      { url: 'https://pwrstuff.s3.eu-central-1.amazonaws.com/1/D30+zoomed+polarized.JPG', type: 'polarized' as const },
    ],
    correctAnswers: ['nevus'],
    explanation: {
      pl: 'Znamię melanocytowe z typowym wzorem siatkowym (reticular pattern). Regularna siatka pigmentowa z jednolitymi oczkami świadczy o łagodnym charakterze zmiany.',
      en: 'Melanocytic nevus with typical reticular pattern. Regular pigment network with uniform meshes indicates benign nature.',
    },
    features: [
      { pl: 'Regularny wzór siatkowy', en: 'Regular reticular pattern' },
      { pl: 'Jednolite oczka siatki', en: 'Uniform network meshes' },
      { pl: 'Symetryczna zmiana', en: 'Symmetrical lesion' },
    ],
    differentials: [
      { pl: 'Czerniak in situ', en: 'Melanoma in situ' },
      { pl: 'Znamię dysplastyczne', en: 'Dysplastic nevus' },
    ],
    pitfall: null,
    annotations: null,
  },
  {
    id: 'case-1-1-3',
    testId: 'test-1-1',
    order: 3,
    images: [
      { url: 'https://pwrstuff.s3.eu-central-1.amazonaws.com/1/D30+zoomed+polarized.JPG', type: 'polarized' as const },
      { url: 'https://pwrstuff.s3.eu-central-1.amazonaws.com/1/D30+zoomed+polarized.JPG', type: 'non-polarized' as const },
    ],
    correctAnswers: ['bcc'],
    explanation: {
      pl: 'Rak podstawnokomórkowy z charakterystycznymi rozgałęzionymi naczyniami (arborizing vessels) i obszarami lśniącymi biało-różowymi. Brak siatki pigmentowej.',
      en: 'Basal cell carcinoma with characteristic arborizing vessels and shiny white-pink areas. No pigment network present.',
    },
    features: [
      { pl: 'Naczynia rozgałęzione (arborizing vessels)', en: 'Arborizing vessels' },
      { pl: 'Lśniące białe obszary', en: 'Shiny white areas' },
      { pl: 'Brak siatki pigmentowej', en: 'Absent pigment network' },
    ],
    differentials: [
      { pl: 'Włókniak twardy skóry', en: 'Dermatofibroma' },
      { pl: 'Czerniak amelanotyczny', en: 'Amelanotic melanoma' },
    ],
    pitfall: {
      pl: 'BCC pigmentowany może zawierać struktury liściopodobne i gniazda jajowate - nie mylić z czerniakiem.',
      en: 'Pigmented BCC may contain leaf-like structures and ovoid nests - do not confuse with melanoma.',
    },
    annotations: null,
  },
  {
    id: 'case-1-2-1',
    testId: 'test-1-2',
    order: 1,
    images: [
      { url: 'https://pwrstuff.s3.eu-central-1.amazonaws.com/1/D30+zoomed+polarized.JPG', type: 'polarized' as const },
    ],
    correctAnswers: ['dermatofibroma'],
    explanation: {
      pl: 'Włókniak twardy skóry z centralną białą blizną i delikatną siatką pigmentową na obwodzie. Charakterystyczny objaw "wciągania" przy ucisku bocznym.',
      en: 'Dermatofibroma with central white scar-like area and delicate pigment network at periphery. Characteristic dimple sign on lateral compression.',
    },
    features: [
      { pl: 'Centralna biała blizna', en: 'Central white scar-like area' },
      { pl: 'Obwodowa siatka pigmentowa', en: 'Peripheral pigment network' },
      { pl: 'Objaw wciągania', en: 'Dimple sign' },
    ],
    differentials: [
      { pl: 'Czerniak desmoplastyczny', en: 'Desmoplastic melanoma' },
      { pl: 'Rak podstawnokomórkowy', en: 'Basal cell carcinoma' },
    ],
    pitfall: null,
    annotations: null,
  },
  {
    id: 'case-2-1-1',
    testId: 'test-2-1',
    order: 1,
    images: [
      { url: 'https://pwrstuff.s3.eu-central-1.amazonaws.com/1/D30+zoomed+polarized.JPG', type: 'polarized' as const },
    ],
    correctAnswers: ['dysplastic-nevus'],
    explanation: {
      pl: 'Znamię dysplastyczne z nieregularną siatką pigmentową i asymetrią barwnika. Obecne różne odcienie brązu. Wymaga obserwacji lub biopsji przy istotnych zmianach.',
      en: 'Dysplastic nevus with irregular pigment network and pigment asymmetry. Multiple shades of brown present. Requires monitoring or biopsy if significant changes occur.',
    },
    features: [
      { pl: 'Nieregularna siatka pigmentowa', en: 'Irregular pigment network' },
      { pl: 'Asymetria barwnika', en: 'Pigment asymmetry' },
      { pl: 'Różne odcienie brązu', en: 'Multiple shades of brown' },
    ],
    differentials: [
      { pl: 'Czerniak in situ', en: 'Melanoma in situ' },
      { pl: 'Znamię Reeda', en: 'Reed nevus' },
    ],
    pitfall: {
      pl: 'Granica między znamieniem dysplastycznym a wczesnym czerniakiem bywa niewyraźna - w razie wątpliwości wykonaj biopsję.',
      en: 'The boundary between dysplastic nevus and early melanoma can be unclear - when in doubt, perform a biopsy.',
    },
    annotations: null,
  },
];

async function seed() {
  console.log('Starting Firestore seed...\n');

  // Seed levels
  console.log('\nSeeding levels...');
  const levelsRef = db.collection('levels');
  for (const level of levels) {
    await levelsRef.doc(level.id).set(level);
    console.log(`  ✓ ${level.title.en}`);
  }

  // Seed tests
  console.log('\nSeeding tests...');
  const testsRef = db.collection('tests');
  for (const test of tests) {
    await testsRef.doc(test.id).set(test);
    console.log(`  ✓ ${test.title.en}`);
  }

  // Seed cases
  console.log('\nSeeding cases...');
  const casesRef = db.collection('cases');
  for (const caseItem of cases) {
    await casesRef.doc(caseItem.id).set(caseItem);
    console.log(`  ✓ ${caseItem.id}`);
  }

  console.log('\n✅ Seed completed successfully!');
  console.log(`
Summary:
  - ${levels.length} levels
  - ${tests.length} tests (with embedded answers)
  - ${cases.length} cases
  `);
}

seed().catch(console.error);
