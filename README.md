# Testy Akademia Dermatoskopii

Dermatoscopy training PWA with interactive quizzes.

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
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run test` | Run tests |
| `npm run test:coverage` | Run tests with coverage |
| `npm run lint` | Run ESLint |
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
public/           # Static assets
scripts/          # Utility scripts (seeding, admin)
.github/          # CI/CD workflows
```

## Deployment

- CI/CD via GitHub Actions
- Firebase Hosting for frontend
- Firebase CLI for rules and indexes deployment

### CI/CD Pipeline

- **deploy.yml**: Lint, test, build, and deploy to Firebase Hosting on push to main

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes and commit: `git commit -m 'Add your feature'`
4. Push to your fork: `git push origin feature/your-feature`
5. Open a Pull Request

Please ensure your code:
- Passes all tests (`npm run test`)
- Passes linting (`npm run lint`)
- Follows existing code style

## Security

If you discover a security vulnerability, please do NOT open a public issue. Instead, please email the maintainers directly so the issue can be addressed before public disclosure.

When reporting a vulnerability, please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

## Documentation

- [Feature Specifications](./SPECS.md)

## License

MIT License - see [LICENSE](./LICENSE) for details.
