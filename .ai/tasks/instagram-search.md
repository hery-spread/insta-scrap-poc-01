# Instagram Search Plan

## Overview
Implement Instagram scraping functionality to search posts and reels by caption text. The scraper will navigate to a user's profile and extract post/reel data including URLs and captions for search filtering.

**IMPORTANT**: Use `src/youtube-search.ts` as the template/inspiration for this implementation. Follow its patterns for:
- Loop structure with maxResult and maxDuration
- Timeout checking
- Scrolling mechanism
- Item extraction with page.evaluate()
- Console logging style
- Single-file organization
- Output format

## Target URLs
- **Posts**: `https://www.instagram.com/[username]/`
- **Reels**: `https://www.instagram.com/[username]/reels/`

## HTML Structure Analysis

### Posts Page Structure (instagram_profile_post.html)
- Grid layout with posts in `<div>` containers
- Each post is wrapped in an `<a>` tag with:
  - `href` attribute containing post URL (format: `/username/reel/POST_ID/` or `/username/p/POST_ID/`)
  - Nested `<img>` tag with `alt` attribute containing the full caption text

### Reels Page Structure (instagram_profile_reel.html & instagram_profile_reel_item.html)
- Similar grid structure to posts
- Reel links follow format: `/username/reel/REEL_ID/`
- Caption text stored in `<img>` `alt` attribute

## Implementation Plan

### 1. Core Data Structures

#### PostData Interface
```typescript
interface PostData {
  url: string;           // Full Instagram URL
  postId: string;        // Extracted post ID
  caption: string;       // Full caption text from alt attribute
  type: 'post' | 'reel'; // Content type
}
```

### 2. Function Breakdown

#### Function: `scrapeInstagramPosts(username: string, searchQuery?: string, maxResult: number, maxDuration: number)`
**Purpose**: Scrape posts from user's main profile page

**Steps** (following youtube-search.ts pattern):
1. Navigate to `https://www.instagram.com/${username}/`
2. Wait for page load with selector and timeout
3. Initialize tracking variables:
   - `results: PostData[] = []`
   - `processedUrls: Set<string>()`
   - `startTime = Date.now()`
4. Start while loop: `while (results.length < maxResult)`
   - **Check timeout**: Calculate `elapsedTime = Date.now() - startTime`, break if `elapsedTime > maxDuration`
   - **Extract items from current view**: Use `page.evaluate()` to extract all post links and captions from DOM
     - Select all `<a>` tags with href matching `/p/` or `/reel/`
     - For each link, extract: `url`, `caption` (from img alt attribute)
     - Return array of items
   - **Process each item**:
     - Skip if `processedUrls.has(url)` or `results.length >= maxResult`
     - Check timeout again before processing
     - Add to `processedUrls`
     - Extract post ID from URL
     - Determine type from URL pattern (contains `/p/` = 'post', contains `/reel/` = 'reel')
     - If `searchQuery` provided, check if caption contains search term (case-insensitive)
     - If matches (or no search query), add to results array
   - **Check if maxResult reached**, break if yes
   - **Get current item count** before scrolling
   - **Scroll window**: Use `window.scrollTo(0, document.body.scrollHeight)`
   - **Wait for new content** to load (with delay)
   - **Get new item count** after scrolling
   - **Break if no new items** loaded (`newItemCount === currentItemCount`)
5. Return results array

**Key Selectors** (to be determined during implementation):
- Post links: `a[href*="/p/"], a[href*="/reel/"]`
- Caption: `img[alt]` within post link

#### Function: `scrapeInstagramReels(username: string, searchQuery?: string, maxResult: number, maxDuration: number)`
**Purpose**: Scrape reels from user's reels page

**Steps** (following youtube-search.ts pattern):
1. Navigate to `https://www.instagram.com/${username}/reels/`
2. Wait for page load with selector and timeout
3. Initialize tracking variables:
   - `results: PostData[] = []`
   - `processedUrls: Set<string>()`
   - `startTime = Date.now()`
4. Start while loop: `while (results.length < maxResult)`
   - **Check timeout**: Calculate `elapsedTime = Date.now() - startTime`, break if `elapsedTime > maxDuration`
   - **Extract items from current view**: Use `page.evaluate()` to extract all reel links and captions from DOM
     - Select all `<a>` tags with href matching `/reel/`
     - For each link, extract: `url`, `caption` (from img alt attribute)
     - Return array of items
   - **Process each item**:
     - Skip if `processedUrls.has(url)` or `results.length >= maxResult`
     - Check timeout again before processing
     - Add to `processedUrls`
     - Extract reel ID from URL
     - Set type to 'reel'
     - If `searchQuery` provided, check if caption contains search term (case-insensitive)
     - If matches (or no search query), add to results array
   - **Check if maxResult reached**, break if yes
   - **Get current item count** before scrolling
   - **Scroll window**: Use `window.scrollTo(0, document.body.scrollHeight)`
   - **Wait for new content** to load (with delay)
   - **Get new item count** after scrolling
   - **Break if no new items** loaded (`newItemCount === currentItemCount`)
5. Return results array

**Key Selectors** (to be determined during implementation):
- Reel links: `a[href*="/reel/"]`
- Caption: `img[alt]` within reel link

### 3. Helper Functions

#### Helper: Extract Post ID from URL
**Purpose**: Parse post/reel ID from Instagram URL

**Logic**:
```typescript
// URL format: https://www.instagram.com/username/p/POST_ID/
// or: https://www.instagram.com/username/reel/REEL_ID/
// Extract ID using regex: /\/(p|reel)\/([^\/]+)/
const match = url.match(/\/(p|reel)\/([^\/]+)/);
const postId = match ? match[2] : '';
```

#### Helper: Check if Caption Matches Search Query
**Purpose**: Case-insensitive search in caption text

**Logic**:
```typescript
const searchLower = searchQuery.toLowerCase();
const captionLower = caption.toLowerCase();
if (captionLower.includes(searchLower)) {
  // Match found
}
```

**Note**: Following youtube-search.ts pattern, most logic is implemented inline within the main scraping functions rather than extracted into separate utility functions.

### 4. Loop Pattern Example (from youtube-search.ts)

The core scraping loop should follow this pattern:

```typescript
const results: PostData[] = [];
const processedUrls = new Set<string>();
const startTime = Date.now();

while (results.length < maxResult) {
  // 1. Check timeout
  const elapsedTime = Date.now() - startTime;
  if (elapsedTime > maxDuration) {
    console.log(`[Posts] Timeout: Reached max duration of ${maxDuration / 1000}s`);
    break;
  }

  // 2. Extract items from current view using page.evaluate()
  const items = await page.evaluate(() => {
    const postLinks = document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]');
    const extracted: { url: string; caption: string }[] = [];

    for (const link of postLinks) {
      const href = (link as HTMLAnchorElement).href;
      const img = link.querySelector('img[alt]');
      const caption = img?.getAttribute('alt') || '';

      if (href) {
        extracted.push({ url: href, caption });
      }
    }

    return extracted;
  });

  console.log(`[Posts] Found ${items.length} items in current view`);

  // 3. Process each item
  for (const item of items) {
    if (processedUrls.has(item.url) || results.length >= maxResult) {
      continue;
    }

    // Check timeout again
    const elapsedTime = Date.now() - startTime;
    if (elapsedTime > maxDuration) {
      console.log(`[Posts] Timeout during processing`);
      break;
    }

    processedUrls.add(item.url);

    // Extract post ID and determine type
    const match = item.url.match(/\/(p|reel)\/([^\/]+)/);
    const postId = match ? match[2] : '';
    const type = item.url.includes('/p/') ? 'post' : 'reel';

    // Filter by search query if provided
    if (!search || item.caption.toLowerCase().includes(search.toLowerCase())) {
      results.push({
        url: item.url,
        postId: postId,
        caption: item.caption,
        type: type
      });

      console.log(`[Posts] Found ${type} ${results.length}/${maxResult}: ${item.url}`);
    }
  }

  // 4. Check if max result reached
  if (results.length >= maxResult) {
    console.log(`[Posts] Reached maxResult (${maxResult})`);
    break;
  }

  // 5. Get current item count before scrolling
  const currentItemCount = await page.evaluate(() => {
    return document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]').length;
  });

  // 6. Scroll to load more content
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });

  // 7. Wait for new content to load
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 8. Get new item count
  const newItemCount = await page.evaluate(() => {
    return document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]').length;
  });

  // 9. Break if no new items loaded
  if (newItemCount === currentItemCount) {
    console.log('[Posts] No more items to load');
    break;
  }
}

return results;
```

### 5. Error Handling Considerations

- **Login Wall**: Instagram may require login for some profiles
  - Detect login prompt
  - Option to pass credentials or use existing session
  - Handle cookie acceptance dialogs

- **Private Accounts**: Cannot access content
  - Detect private account indicator
  - Return appropriate error/empty result

- **Rate Limiting**: Instagram may block excessive requests
  - Implement delays between requests
  - Randomize scroll timing
  - Use real browser profile to avoid detection

- **Content Loading Failures**:
  - Retry logic for failed page loads
  - Timeout handling for slow connections
  - Graceful degradation if some posts fail to load

### 6. Search Functionality

#### Basic Search
- Single keyword search in caption text
- Case-insensitive matching
- Returns all posts containing the keyword

#### Advanced Search (Future Enhancement)
- Multiple keywords with AND/OR operators
- Hashtag-specific search
- Date range filtering (if timestamps available)
- Regex pattern matching

### 7. Integration Points

#### Main Entry Point - `run()` Function (following youtube-search.ts pattern)

**Structure**:
```typescript
async function run() {
  // 1. Initialize browser (same as youtube-search.ts)
  const { browser, page } = await connect({
    headless: false,
    customConfig: { chromePath: "..." },
    args: ["--no-sandbox"],
    turnstile: true,
  });

  // 2. Set viewport
  await page.setViewport({ width: 1920, height: 1080 });

  // 3. Define configuration variables
  const username = "nike";
  const search = "innovation";  // Optional, can be empty for all posts
  const maxResult = 100;
  const maxDuration = 5 * 60 * 1000; // 5 minutes in milliseconds

  // 4. Log configuration
  console.log(`Scraping Instagram: @${username}`);
  console.log(`Searching for: "${search}"`);
  console.log(`Max results: ${maxResult}`);
  console.log(`Max duration: ${maxDuration / 1000}s\n`);

  // 5. Scrape posts
  console.log("=== Starting post scraping ===");
  const posts = await scrapeInstagramPosts(page, username, search, maxResult, maxDuration);
  console.log(`=== Post scraping complete: ${posts.length} items found ===\n`);

  // 6. Scrape reels (optional, or combine based on contentType config)
  console.log("=== Starting reel scraping ===");
  const reels = await scrapeInstagramReels(page, username, search, maxResult, maxDuration);
  console.log(`=== Reel scraping complete: ${reels.length} items found ===\n`);

  // 7. Combine results
  const allResults = [...posts, ...reels];

  // 8. Print summary and results
  console.log(`\n=== SUMMARY ===`);
  console.log(`Total found: ${allResults.length} posts/reels containing "${search}"`);
  console.log(`\n=== RESULTS ===`);
  console.log(JSON.stringify(allResults, null, 2));

  // 9. Close browser
  await new Promise(resolve => setTimeout(resolve, 5000));
  await browser.close();
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.log("[run] an error occurred", error);
    process.exit(1);
  });
```

### 8. Testing Strategy

#### Test Cases
1. Scrape posts without search query (return all posts)
2. Scrape reels without search query (return all reels)
3. Search posts with keyword that exists
4. Search posts with keyword that doesn't exist
5. Search with multiple keywords
6. Handle private account
7. Handle non-existent username
8. Handle rate limiting/blocks

#### Test Accounts
- Use public accounts with varied content (e.g., @nike, @natgeo)
- Test with accounts that have mix of posts and reels

### 9. Performance Considerations

- **Scrolling Strategy**: Balance between loading all content and performance
  - Set reasonable max scroll limit
  - Stop if no new content appears after N scrolls

- **Parallel Processing**: Extract data from multiple posts concurrently
  - Use Promise.all() for independent operations

- **Memory Management**: Clear references to large DOM elements after extraction

- **Network Optimization**:
  - Block unnecessary resources (ads, analytics)
  - Use existing image optimization if available

### 10. Output Format

#### JSON Structure
Simple array of results (similar to youtube-search.ts):
```json
[
  {
    "url": "https://www.instagram.com/nike/p/DTQW_NMDlJy/",
    "postId": "DTQW_NMDlJy",
    "caption": "A MIND-ALTERING SHOE. Nike Mind activates...",
    "type": "post"
  },
  {
    "url": "https://www.instagram.com/nike/reel/DQJxDm9joWp/",
    "postId": "DQJxDm9joWp",
    "caption": "There is no finish line when it comes to innovating...",
    "type": "reel"
  }
]
```

The results should be printed directly as JSON array, similar to how youtube-search.ts outputs results.

### 11. File Organization

**Single file only**: `src/instagram-search.ts`

Follow the exact same structure as `src/youtube-search.ts`:
- PostData interface (like SearchResult interface in youtube-search.ts)
- scrapeInstagramPosts() function (like scrapeFromSearch() in youtube-search.ts)
- scrapeInstagramReels() function (similar structure to scrapeInstagramPosts)
- run() function (entry point - same structure as youtube-search.ts)
- All logic inline (no separate utilities, no separate types)

Do NOT create multiple files or separate modules. Reference youtube-search.ts throughout implementation.

## Next Steps After Planning

**REFERENCE**: Keep `src/youtube-search.ts` open while implementing - copy its structure and patterns!

1. Create `src/instagram-search.ts` file
2. Define `PostData` interface at the top (like `SearchResult` in youtube-search.ts)
3. Implement `scrapeInstagramPosts()` function:
   - Copy the while loop structure from `scrapeFromSearch()` in youtube-search.ts
   - Adapt selectors for Instagram (replace YouTube selectors with Instagram ones)
   - Use `page.evaluate()` to extract items from current view
   - Implement timeout checking with maxDuration (same pattern as youtube-search.ts)
   - Implement scrolling with `window.scrollTo(0, document.body.scrollHeight)`
   - Track processed URLs to avoid duplicates
4. Implement `scrapeInstagramReels()` function (similar to posts, same pattern)
5. Implement `run()` function as entry point:
   - Copy structure from youtube-search.ts run() function
   - Initialize browser with puppeteer-real-browser (same config)
   - Set viewport to 1920x1080
   - Define configuration variables
   - Call scraping functions
   - Combine and output results
6. Test with public accounts (e.g., @nike)
7. Verify scrolling loads more content
8. Test search filtering works correctly
9. Verify maxDuration timeout works
10. Test with accounts that have both posts and reels
