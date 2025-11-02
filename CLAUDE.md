# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Instagram scraping application built with TypeScript and Puppeteer. Uses `puppeteer-real-browser` to bypass bot detection by running a real Chrome browser instance rather than headless Chrome.

## Key Architecture

### Browser Setup
- **puppeteer-real-browser**: Uses a real Chrome browser instance to avoid detection
- **Custom Chrome Path**: Chrome binary is stored locally at `./chrome/mac-142.0.7444.59/chrome-mac-x64/`
- **Headless Mode**: Currently set to `false` (visible browser) for development
- **Turnstile Support**: Enabled to handle Cloudflare challenges

### Entry Point
- `src/index.ts`: Main entry point containing the `run()` function
- Currently configured to navigate to a specific Instagram post URL
- Uses 3-second delay before closing browser (simple wait mechanism)

## Common Commands

### Build and Run
```bash
# Compile TypeScript to JavaScript
npx tsc

# Run the compiled JavaScript
node src/index.js

# Or compile and run in one step
npx ts-node src/index.ts
```

### Development
```bash
# Install dependencies
npm install

# Type check without emitting
npx tsc --noEmit
```

## Important Notes

### Chrome Binary
- The project expects a Chrome browser at `./chrome/mac-142.0.7444.59/chrome-mac-x64/`
- This directory is gitignored and must be present locally
- If Chrome path changes, update `customConfig.chromePath` in `src/index.ts`

### Instagram Scraping
- Currently targets Instagram posts via direct URLs
- Uses real browser to avoid detection mechanisms
- Browser runs in visible mode (`headless: false`) for easier debugging
- `--no-sandbox` flag is used for compatibility (required in some environments)

### TypeScript Configuration
- Target: ES2016
- Module: CommonJS
- Strict mode enabled
- Uses standard TypeScript compilation to JavaScript
