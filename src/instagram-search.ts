import { readFile } from "fs/promises";
import { connect } from "puppeteer-real-browser";

interface PostData {
  url: string;
  postId: string;
  caption: string;
  type: "post" | "reel";
}

async function extractCaptionFromPostUrl(
  page: any,
  url: string,
): Promise<string> {
  try {
    console.log(`  [Caption] Navigating to: ${url}`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const caption = await page.evaluate(() => {
      const titleEl = document.querySelector("meta[property='og:title']");
      const result = titleEl?.getAttribute("content") ?? "";
      // remove text like "[User Name] on Instagram"
      return result.split(":").slice(1).join(":");
    });

    console.log(`  [Caption] Extracted: ${caption.substring(0, 50)}...`);
    return caption;
  } catch (error) {
    console.log(`  [Caption] Error extracting from ${url}:`, error);
    return "";
  }
}

async function scrapeInstagramPosts(
  page: any,
  profileUrl: string,
  search: string,
  maxResult: number,
  maxDuration: number,
  urlsToSkip: Set<string> = new Set(),
): Promise<PostData[]> {
  console.log(`[Posts] Navigating to profile: ${profileUrl}`);
  await page.goto(profileUrl);

  // Wait for posts to load
  console.log(`[Posts] Waiting for posts to load`);
  await page.waitForSelector('a[href*="/p/"], a[href*="/reel/"]', {
    timeout: 30000,
  });
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const results: PostData[] = [];
  const searchLower = search ? search.toLowerCase() : "";
  const processedUrls = new Set<string>();
  const startTime = Date.now();

  // Streaming approach: Extract URLs from current view, process them, then scroll
  console.log(`[Posts] Starting streaming extraction`);
  let previousItemCount = 0;

  while (true) {
    // Check timeout
    const elapsedTime = Date.now() - startTime;
    if (elapsedTime > maxDuration) {
      console.log(
        `[Posts] Timeout: Reached max duration of ${maxDuration / 1000}s`,
      );
      break;
    }

    if (results.length >= maxResult) {
      console.log(`[Posts] Reached maxResult (${maxResult})`);
      break;
    }

    // Extract URLs from current view
    const urls = await page.evaluate(() => {
      const postLinks = document.querySelectorAll(
        'a[href*="/p/"], a[href*="/reel/"]',
      );
      const extracted: string[] = [];
      for (const link of postLinks) {
        const href = (link as HTMLAnchorElement).href;
        if (href) extracted.push(href);
      }
      return extracted;
    });

    console.log(`[Posts] Found ${urls.length} posts in current view`);

    // Process URLs from current view
    for (const url of urls) {
      if (results.length >= maxResult) {
        console.log(`[Posts] Reached maxResult (${maxResult})`);
        break;
      }

      // Check timeout again
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > maxDuration) {
        console.log(
          `[Posts] Timeout: Reached max duration of ${maxDuration / 1000}s`,
        );
        break;
      }

      if (processedUrls.has(url)) continue;
      if (urlsToSkip.has(url)) continue;
      processedUrls.add(url);

      // Extract post ID and determine type
      const match = url.match(/(p|reel)\/([^/]+)/);
      const postId = match ? match[2] : "";
      const type = url.includes("/p/") ? "post" : "reel";

      console.log(`[Posts] Processing ${processedUrls.size}: ${postId}`);

      // Extract caption by visiting the post URL
      const caption = await extractCaptionFromPostUrl(page, url);

      // Filter by search query if provided
      if (!search || caption.toLowerCase().includes(searchLower)) {
        results.push({
          url: url,
          postId: postId,
          caption: caption,
          type: type as "post" | "reel",
        });

        console.log(
          `[Posts] ✓ Added ${type} ${results.length}/${maxResult} (matches search)`,
        );
      } else {
        console.log(`[Posts] ✗ Skipped (no match for "${search}")`);
      }
    }

    // Get current item count before scrolling
    const currentItemCount = await page.evaluate(() => {
      return document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')
        .length;
    });

    // Break if no new items loaded
    if (currentItemCount === previousItemCount) {
      console.log(`[Posts] No more posts to load`);
      break;
    }

    previousItemCount = currentItemCount;

    // Scroll to load more
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  return results;
}

async function scrapeInstagramReels(
  page: any,
  profileUrl: string,
  search: string,
  maxResult: number,
  maxDuration: number,
  urlsToSkip: Set<string> = new Set(),
): Promise<PostData[]> {
  // Construct reels URL from profile URL
  const reelsUrl = profileUrl.endsWith("/")
    ? `${profileUrl}reels/`
    : `${profileUrl}/reels/`;

  console.log(`[Reels] Navigating to reels: ${reelsUrl}`);
  await page.goto(reelsUrl);

  // Wait for reels to load
  console.log(`[Reels] Waiting for reels to load`);
  await page.waitForSelector('a[href*="/reel/"]', { timeout: 30000 });
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const results: PostData[] = [];
  const searchLower = search ? search.toLowerCase() : "";
  const processedUrls = new Set<string>();
  const startTime = Date.now();

  // Streaming approach: Extract URLs from current view, process them, then scroll
  console.log(`[Reels] Starting streaming extraction`);
  let previousItemCount = 0;

  while (true) {
    // Check timeout
    const elapsedTime = Date.now() - startTime;
    if (elapsedTime > maxDuration) {
      console.log(
        `[Reels] Timeout: Reached max duration of ${maxDuration / 1000}s`,
      );
      break;
    }

    if (results.length >= maxResult) {
      console.log(`[Reels] Reached maxResult (${maxResult})`);
      break;
    }

    // Extract URLs from current view
    const urls = await page.evaluate(() => {
      const reelLinks = document.querySelectorAll('a[href*="/reel/"]');
      const extracted: string[] = [];
      for (const link of reelLinks) {
        const href = (link as HTMLAnchorElement).href;
        if (href) extracted.push(href);
      }
      return extracted;
    });

    console.log(`[Reels] Found ${urls.length} reels in current view`);

    // Process URLs from current view
    for (const url of urls) {
      if (results.length >= maxResult) {
        console.log(`[Reels] Reached maxResult (${maxResult})`);
        break;
      }

      // Check timeout again
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > maxDuration) {
        console.log(
          `[Reels] Timeout: Reached max duration of ${maxDuration / 1000}s`,
        );
        break;
      }

      if (processedUrls.has(url)) continue;
      if (urlsToSkip.has(url)) continue;
      processedUrls.add(url);

      // Extract reel ID
      const match = url.match(/\/reel\/([^/]+)/);
      const postId = match ? match[1] : "";

      console.log(`[Reels] Processing ${processedUrls.size}: ${postId}`);

      // Extract caption by visiting the reel URL
      const caption = await extractCaptionFromPostUrl(page, url);

      // Filter by search query if provided
      if (!search || caption.toLowerCase().includes(searchLower)) {
        // Check if URL already exists in results
        if (!results.some((r) => r.url === url)) {
          results.push({
            url: url,
            postId: postId,
            caption: caption,
            type: "reel",
          });

          console.log(
            `[Reels] ✓ Added reel ${results.length}/${maxResult} (matches search)`,
          );
        }
      } else {
        console.log(`[Reels] ✗ Skipped (no match for "${search}")`);
      }
    }

    // Get current item count before scrolling
    const currentItemCount = await page.evaluate(() => {
      return document.querySelectorAll('a[href*="/reel/"]').length;
    });

    // Break if no new items loaded
    if (currentItemCount === previousItemCount) {
      console.log(`[Reels] No more reels to load`);
      break;
    }

    previousItemCount = currentItemCount;

    // Scroll to load more
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  return results;
}

async function extractUsername(page: any): Promise<string> {
  // Extract username from Instagram profile URL
  // Supports formats: https://www.instagram.com/nike, https://www.instagram.com/nike/
  const url = await page.url();
  const match = url.match(/instagram\.com\/([^/?]+)/);
  return match ? match[1] : "";
}

async function run() {
  const { browser, page } = await connect({
    headless: false,
    customConfig: {
      chromePath:
        "./chrome/mac-142.0.7444.59/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
      // "./chrome/linux-143.0.7499.146/chrome-linux64/chrome",
    },
    args: ["--no-sandbox"],
    turnstile: true,
  });

  const cookiesData = await readFile("cookies.json", "utf-8");
  const cookies = JSON.parse(cookiesData);

  await page.setCookie(...cookies);

  // Set viewport to 1920x1080 resolution
  await page.setViewport({
    width: 1920,
    height: 1080,
  });

  const profileUrl = "https://www.instagram.com/nike/";
  const username = await extractUsername(page);
  const search = "@Erling";
  const maxResult = 100;
  const maxDuration = 3.5 * 60 * 1000; // 5 minutes in milliseconds

  console.log(`Scraping Instagram: @${username}`);
  console.log(`Profile URL: ${profileUrl}`);
  console.log(`Searching for: "${search}"`);
  console.log(`Max results: ${maxResult}`);
  console.log(`Max duration: ${maxDuration / 1000}s\n`);

  // Scrape posts
  console.log("=== Starting post scraping ===");
  const posts = await scrapeInstagramPosts(
    page,
    profileUrl,
    search,
    maxResult,
    maxDuration,
  );
  console.log(`=== Post scraping complete: ${posts.length} items found ===\n`);

  // Scrape reels, skipping URLs already found in posts
  const postsUrls = new Set(posts.map(p => p.url));
  console.log("=== Starting reel scraping ===");
  const reels = await scrapeInstagramReels(
    page,
    profileUrl,
    search,
    maxResult,
    maxDuration,
    postsUrls,
  );
  console.log(`=== Reel scraping complete: ${reels.length} items found ===\n`);

  // Combine results
  const allResults = [...posts, ...reels];

  console.log(`\n=== SUMMARY ===`);
  console.log(
    `Total found: ${allResults.length} posts/reels containing "${search}"`,
  );
  console.log(`\n=== RESULTS ===`);
  console.log(JSON.stringify(allResults, null, 2));

  await new Promise((resolve) => setTimeout(resolve, 5000));
  await browser.close();
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.log("[run] an error occurred", error);
    process.exit(1);
  });
