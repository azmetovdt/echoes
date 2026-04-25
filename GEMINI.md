# AI Guidelines for `echolocus`

## Tech Stack
- **Framework:** React 19 with Vite
- **Language:** TypeScript
- **Styling:** Tailwind CSS (v4)
- **Icons:** Lucide React
- **Animations:** Motion
- **AI Integration:** `@google/genai`

## Commands
- **Dev:** `npm run dev` (Runs Vite server on port 3000)
- **Build:** `npm run build`
- **Typecheck / Lint:** `npm run lint` (`tsc --noEmit`)

## Architectural Guidelines
- **Components:** Located in `src/components/`. Use functional components and modern React patterns.
- **Services:** Located in `src/services/`. Contains logic for external API integration (e.g., Freesound, morphing) and settings.
- **Styling:** Use Tailwind CSS utility classes.
- **Type Safety:** Strict TypeScript adherence is expected. Avoid using `any` and explicitly define interfaces/types for props and state.

## Core Rules
- **Formatting:** Keep the code formatted nicely and follow existing workspace patterns.
- **Dependencies:** Avoid adding unnecessary third-party dependencies.
- **Code Quality:** Prioritize clear, maintainable, and idiomatic React code. Ensure type checking passes (`npm run lint`) after modifications.
