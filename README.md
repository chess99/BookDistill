# BookDistill (GitHub Pages Frontend)

BookDistill is now configured as a pure frontend app for GitHub Pages.

## Local development

Prerequisites: Node.js 20+

1. Install dependencies:
   `npm install`
2. Start dev server:
   `npm run dev`
3. Open the app, paste your Gemini API key in the UI, then upload an `.epub`.

The Gemini API key is entered from the frontend and stored in browser `localStorage` (`book_distill_gemini_api_key`).

## GitHub Pages deployment

The repository includes `.github/workflows/deploy-pages.yml` to build and deploy on every push to `main`.

Before first deployment, enable GitHub Pages in repository settings:

1. Go to **Settings** -> **Pages**
2. In **Build and deployment**, choose **GitHub Actions**

The Vite base path is set to `/BookDistill/` for production. If your repository name changes, update `base` in `vite.config.ts`.

## Security note

This is a pure frontend architecture, so API keys used in the browser should be treated as exposed to the client environment.
Use restricted keys, quotas, and avoid using high-privilege keys.
