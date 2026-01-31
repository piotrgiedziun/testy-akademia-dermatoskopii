# Testy Akademia Dermatoskopii

[![CI/CD](https://github.com/piotrgiedziun/testy-akademia-dermatoskopii/actions/workflows/deploy.yml/badge.svg)](https://github.com/piotrgiedziun/testy-akademia-dermatoskopii/actions/workflows/deploy.yml)
[![E2E Tests](https://github.com/piotrgiedziun/testy-akademia-dermatoskopii/actions/workflows/e2e.yml/badge.svg)](https://github.com/piotrgiedziun/testy-akademia-dermatoskopii/actions/workflows/e2e.yml)
[![GitHub](https://img.shields.io/github/license/piotrgiedziun/testy-akademia-dermatoskopii)](https://github.com/piotrgiedziun/testy-akademia-dermatoskopii/blob/main/LICENSE)
[![GitHub](https://img.shields.io/github/issues/piotrgiedziun/testy-akademia-dermatoskopii)](https://github.com/piotrgiedziun/testy-akademia-dermatoskopii/issues)
[![GitHub](https://img.shields.io/github/issues-pr/piotrgiedziun/testy-akademia-dermatoskopii)](https://github.com/piotrgiedziun/testy-akademia-dermatoskopii/pulls)


[https://akademiadermatoskopiitesty.web.app/](https://akademiadermatoskopiitesty.web.app/)

## Features

- Interactive dermoscopy case quizzes
- Multiple timer modes (countdown, stopwatch, untimed)
- Polish/English localization
- Progressive Web App (offline support)
- Admin panel for content management

## Tech Stack

- React 18 + TypeScript + Vite
- Firebase (Auth, Firestore, Storage, Hosting)
- Tailwind CSS
- Zustand (state management)
- PWA with Workbox

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- Firebase CLI

### Installation

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and fill in your Firebase credentials
4. Start dev server: `npm run dev`

### Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Description |
|----------|-------------|
| `VITE_FIREBASE_API_KEY` | Firebase API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |

For admin scripts, also set:
- `FIREBASE_PROJECT_ID` - Your Firebase project ID

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run dev:e2e` | Start dev server with Firebase emulators |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run test` | Run unit tests |
| `npm run test:coverage` | Run unit tests with coverage |
| `npm run test:e2e` | Run E2E tests with Playwright |
| `npm run test:e2e:ui` | Run E2E tests with Playwright UI |
| `npm run lint` | Run ESLint |
| `npm run emulators` | Start Firebase emulators |
| `npm run seed` | Seed Firestore with sample data |

## Project Structure

```
src/
  features/
    admin/        # Admin panel (tests, cases, diagnoses management)
    auth/         # Authentication (login, register, profile)
    courses/      # Course navigation (levels, tests)
    home/         # Landing page
    quiz/         # Quiz interface (questions, feedback)
    results/      # Quiz results display
  locales/        # i18n translations (en, pl)
  stores/         # Zustand state management
  types/          # TypeScript type definitions
  test/           # Test setup and utilities
e2e/
  fixtures/       # Test data and images
  page-objects/   # Page Object Model classes
  tests/          # E2E test specs
  utils/          # Firebase admin and test helpers
public/           # Static assets
scripts/          # Utility scripts (seeding, admin)
.github/          # CI/CD workflows
```

## Upgrade packages

```bash
npx npm-check-updates -u --target minor && npm install 
```

## Testing

### Unit Tests

Unit tests use Vitest and React Testing Library:

```bash
npm run test           # Run tests in watch mode
npm run test -- --run  # Run tests once
npm run test:coverage  # Run tests with coverage report
```

### E2E Tests

E2E tests use Playwright with Firebase emulators for isolated testing.

**Quick run (all-in-one):**
```bash
npm run e2e  # Starts emulators, dev server, and runs tests automatically
```

**With Playwright UI (for debugging):**
```bash
# Terminal 1: Start Firebase emulators first
npm run emulators

# Terminal 2: Run tests with UI (wait for "All emulators ready!" message)
npm run test:e2e:ui
```

**Other options:**
```bash
npm run test:e2e                        # Run on all browsers (requires emulators running)
npm run test:e2e -- --project=chromium  # Run on specific browser
```

**Test Coverage:**
- Authentication (login, register, terms acceptance)
- Course browsing and quiz completion
- Community features (cases, comments, flagging)
- Admin panel (levels, users, moderation)

**Browsers tested:** Chromium, Firefox, WebKit, Mobile Chrome, Mobile Safari

## Deployment

- CI/CD via GitHub Actions
- Firebase Hosting for frontend
- Firebase CLI for rules and indexes deployment

### CI/CD Pipeline

| Workflow | Trigger | Description |
|----------|---------|-------------|
| `deploy.yml` | Push to main, PRs | Lint, unit test, build, and deploy to Firebase Hosting |
| `e2e.yml` | Push to main, PRs | Run E2E tests with Playwright and Firebase emulators |

**E2E Tests in CI:**
- PRs run Chromium tests only (faster feedback)
- Main branch runs full browser matrix (Chromium, Firefox, WebKit, mobile)
- Test artifacts (reports, screenshots) uploaded on failure

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes and commit: `git commit -m 'Add your feature'`
4. Push to your fork: `git push origin feature/your-feature`
5. Open a Pull Request

Please ensure your code:
- Passes all unit tests (`npm run test -- --run`)
- Passes E2E tests (`npm run test:e2e -- --project=chromium`)
- Passes linting (`npm run lint`)
- Follows existing code style

## License

MIT License - see [LICENSE](./LICENSE) for details.
