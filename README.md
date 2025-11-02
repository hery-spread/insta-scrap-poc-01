# Instagram Scraper

Instagram post/reel scraper that extracts engagement metrics (likes, comments) using Puppeteer with real browser automation to bypass bot detection.

## Prerequisites

- Node.js
- Chrome browser installed via `@puppeteer/browsers`

## Setup

1. Install dependencies:
```bash
npm install
```

2. Install Chrome:
```bash
npx @puppeteer/browsers install chrome@stable
```

3. Add your Instagram cookies to `cookies.json` (required for authentication). Use this [Export cookie JSON file for Puppeteer](https://chromewebstore.google.com/detail/nmckokihipjgplolmcmjakknndddifde?utm_source=item-share-cb) to retreive browser cookies.

## Usage

```bash
npx tsx src/index.ts
```

## How it works

1. Loads Instagram session cookies from `cookies.json`
2. Opens Instagram post/reel URL with real Chrome browser
3. Extracts embedded JSON data from page scripts
4. Parses engagement metrics (like_count, comment_count)

## Output

```
[INFO] success! { like_count: 12345, comment_count: 678 }
```
