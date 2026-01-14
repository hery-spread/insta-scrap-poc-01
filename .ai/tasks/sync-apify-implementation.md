# Sync Apify Implementation with TypeScript Source

Takes a TypeScript implementation file and syncs its corresponding Apify actor to match.

## Input

Provide the TypeScript source file path, e.g., `src/youtube-search.ts` or `src/instagram-search.ts`

## Overview

When a feature or fix is implemented in a TypeScript source file, the corresponding Apify actor must be updated to match the implementation logic.

## File Mapping Pattern

TypeScript source files are paired with Apify implementations using a predictable naming convention:

- `src/{name}.ts` → `src/apify/{name}-apify.js`

For example:
- `src/youtube-search.ts` → `src/apify/youtube-search-apify.js`
- `src/instagram-search.ts` → `src/apify/instagram-search-apify.js`

## Process

1. Review changes in the provided TypeScript implementation
2. Locate the corresponding Apify actor file
3. Update the Apify implementation to match the TypeScript logic
4. Test both implementations produce consistent results
5. Verify no functionality is lost in the sync
