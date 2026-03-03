# BookDistill

AI-powered book knowledge extraction tool. Supports both **Web UI** and **CLI**.

## Features

- 📚 Extract knowledge from EPUB, Markdown files
- 🤖 Powered by Google Gemini (2.5 Flash / 3.0 Pro)
- 🌐 Web UI for browser-based usage
- 💻 CLI for automation and scripting
- 🌍 Multi-language output support

## CLI Usage

### Quick Start

```bash
# Install dependencies
npm install

# Run with your Gemini API key
GEMINI_API_KEY=your_key npm run distill -- -i book.epub -o summary.md
```

### Options

```
-i, --input <file>    Input file (epub, md, markdown)
-o, --output <file>   Output markdown file (default: stdout)
-l, --lang <lang>     Output language (default: Chinese)
-m, --model <model>   Gemini model (default: gemini-3-pro-preview)
-h, --help            Show help
```

### Examples

```bash
# Basic usage (uses Gemini 3.0 Pro by default)
GEMINI_API_KEY=xxx npm run distill -- -i book.epub -o summary.md

# Use Gemini 2.5 Flash for faster processing
GEMINI_API_KEY=xxx npm run distill -- -i book.epub -o summary.md -m gemini-2.5-flash

# Output in English
GEMINI_API_KEY=xxx npm run distill -- -i book.epub -o summary.md -l English

# Output to stdout (for piping)
GEMINI_API_KEY=xxx npm run distill -- -i book.epub > summary.md
```

### Available Models

| Model ID | Description |
|----------|-------------|
| `gemini-3-pro-preview` | Higher quality, recommended (default) |
| `gemini-2.5-flash` | Fast, good for most books |

## Web UI

### Local Development

```bash
npm install
npm run dev
```

Open the app, paste your Gemini API key in the UI, then upload a book file.

### GitHub Pages Deployment

The repository includes `.github/workflows/deploy-pages.yml` for auto-deployment.

1. Go to **Settings** → **Pages**
2. In **Build and deployment**, choose **GitHub Actions**

## Testing

### Run Tests

```bash
# Run parser unit tests
npm test

# Test CLI parsing (without API call)
npm run test:cli

# Manual Web testing
npm run dev
# Then open http://localhost:3000 and test file upload
```

### Test Files

Test fixtures are provided in `test-fixtures/`:
- `test-book.md` - Markdown with Frontmatter
- `no-frontmatter.md` - Markdown without Frontmatter
- `sample.epub` - EPUB placeholder (replace with real file for testing)

See [TEST_GUIDE.md](./TEST_GUIDE.md) for detailed testing instructions.

## Security Note

API keys used in the browser or CLI should be treated carefully:
- Use restricted API keys with quotas
- Don't commit keys to version control
- For CLI, use environment variables

## License

MIT
