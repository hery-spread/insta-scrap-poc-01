/* eslint-disable no-undef */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function pageFunction(context) {
  const { page, log } = context;

  async function extractCaptionFromPostUrl(page, url) {
    try {
      log.info("[Caption] Navigating to:", { url });
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const caption = await page.evaluate(() => {
        const titleEl = document.querySelector("meta[property='og:title']");
        const result = titleEl?.getAttribute("content") ?? "";
        // remove text like "[User Name] on Instagram"
        return result.split(":").slice(1).join(":");
      });

      log.info("[Caption] Extracted:", {
        preview: caption.substring(0, 50),
      });
      return caption;
    } catch (error) {
      log.info("[Caption] Error extracting from URL:", {
        url,
        error: String(error),
      });
      return "";
    }
  }

  async function scrapeInstagramPosts(
    page,
    profileUrl,
    search,
    maxResult,
    maxDuration,
  ) {
    log.info("[Posts] Navigating to profile:", { profileUrl });
    await page.goto(profileUrl);

    // Wait for posts to load
    log.info("[Posts] Waiting for posts to load");
    await page.waitForSelector('a[href*="/p/"], a[href*="/reel/"]', {
      timeout: 30000,
    });
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const results = [];
    const searchLower = search ? search.toLowerCase() : "";
    const processedUrls = new Set();
    const startTime = Date.now();

    // Streaming approach: Extract URLs from current view, process them, then scroll
    log.info("[Posts] Starting streaming extraction");
    let previousItemCount = 0;

    while (true) {
      // Check timeout
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > maxDuration) {
        log.info("[Posts] Timeout: Reached max duration", {
          maxDurationSeconds: maxDuration / 1000,
        });
        break;
      }

      if (results.length >= maxResult) {
        log.info("[Posts] Reached maxResult", { maxResult });
        break;
      }

      // Extract URLs from current view
      const urls = await page.evaluate(() => {
        const postLinks = document.querySelectorAll(
          'a[href*="/p/"], a[href*="/reel/"]',
        );
        const extracted = [];
        for (const link of postLinks) {
          const href = link.href;
          if (href) extracted.push(href);
        }
        return extracted;
      });

      log.info(`[Posts] Found ${urls.length} posts in current view`);

      // Process URLs from current view
      for (const url of urls) {
        if (results.length >= maxResult) {
          log.info("[Posts] Reached maxResult", { maxResult });
          break;
        }

        // Check timeout again
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime > maxDuration) {
          log.info("[Posts] Timeout: Reached max duration", {
            maxDurationSeconds: maxDuration / 1000,
          });
          break;
        }

        if (processedUrls.has(url)) continue;
        processedUrls.add(url);

        // Extract post ID and determine type
        const match = url.match(/(p|reel)\/([^/]+)/);
        const postId = match ? match[2] : "";
        const type = url.includes("/p/") ? "post" : "reel";

        log.info(`[Posts] Processing ${processedUrls.size}: ${postId}`);

        // Extract caption by visiting the post URL
        const caption = await extractCaptionFromPostUrl(page, url);

        // Filter by search query if provided
        if (!search || caption.toLowerCase().includes(searchLower)) {
          results.push({
            url,
            postId,
            caption,
            type,
          });

          log.info(
            `[Posts] ✓ Added ${type} ${results.length}/${maxResult} (matches search)`,
          );
        } else {
          log.info(`[Posts] ✗ Skipped (no match for "${search}")`);
        }
      }

      // Get current item count before scrolling
      const currentItemCount = await page.evaluate(() => {
        return document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')
          .length;
      });

      // Break if no new items loaded
      if (currentItemCount === previousItemCount) {
        log.info("[Posts] No more posts to load");
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
    page,
    profileUrl,
    search,
    maxResult,
    maxDuration,
  ) {
    // Construct reels URL from profile URL
    const reelsUrl = profileUrl.endsWith("/")
      ? `${profileUrl}reels/`
      : `${profileUrl}/reels/`;

    log.info("[Reels] Navigating to reels:", { reelsUrl });
    await page.goto(reelsUrl);

    // Wait for reels to load
    log.info("[Reels] Waiting for reels to load");
    await page.waitForSelector('a[href*="/reel/"]', { timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const results = [];
    const searchLower = search ? search.toLowerCase() : "";
    const processedUrls = new Set();
    const startTime = Date.now();

    // Streaming approach: Extract URLs from current view, process them, then scroll
    log.info("[Reels] Starting streaming extraction");
    let previousItemCount = 0;

    while (true) {
      // Check timeout
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > maxDuration) {
        log.info("[Reels] Timeout: Reached max duration", {
          maxDurationSeconds: maxDuration / 1000,
        });
        break;
      }

      if (results.length >= maxResult) {
        log.info("[Reels] Reached maxResult", { maxResult });
        break;
      }

      // Extract URLs from current view
      const urls = await page.evaluate(() => {
        const reelLinks = document.querySelectorAll('a[href*="/reel/"]');
        const extracted = [];
        for (const link of reelLinks) {
          const href = link.href;
          if (href) extracted.push(href);
        }
        return extracted;
      });

      log.info(`[Reels] Found ${urls.length} reels in current view`);

      // Process URLs from current view
      for (const url of urls) {
        if (results.length >= maxResult) {
          log.info("[Reels] Reached maxResult", { maxResult });
          break;
        }

        // Check timeout again
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime > maxDuration) {
          log.info("[Reels] Timeout: Reached max duration", {
            maxDurationSeconds: maxDuration / 1000,
          });
          break;
        }

        if (processedUrls.has(url)) continue;
        processedUrls.add(url);

        // Extract reel ID
        const match = url.match(/\/reel\/([^/]+)/);
        const postId = match ? match[1] : "";

        log.info(`[Reels] Processing ${processedUrls.size}: ${postId}`);

        // Extract caption by visiting the reel URL
        const caption = await extractCaptionFromPostUrl(page, url);

        // Filter by search query if provided
        if (!search || caption.toLowerCase().includes(searchLower)) {
          results.push({
            url,
            postId,
            caption,
            type: "reel",
          });

          log.info(
            `[Reels] ✓ Added reel ${results.length}/${maxResult} (matches search)`,
          );
        } else {
          log.info(`[Reels] ✗ Skipped (no match for "${search}")`);
        }
      }

      // Get current item count before scrolling
      const currentItemCount = await page.evaluate(() => {
        return document.querySelectorAll('a[href*="/reel/"]').length;
      });

      // Break if no new items loaded
      if (currentItemCount === previousItemCount) {
        log.info("[Reels] No more reels to load");
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

  async function extractUsername(page) {
    // Extract username from Instagram profile URL
    // Supports formats: https://www.instagram.com/nike, https://www.instagram.com/nike/
    const url = await page.url();
    const match = url.match(/instagram\.com\/([^/?]+)/);
    return match ? match[1] : "";
  }

  // Implementation

  await page.setViewport({
    width: 1920,
    height: 1080,
  });

  const username = await extractUsername(page);
  const search = "%search%";
  const maxResult = parseInt("%maxResult%");
  const maxDuration = parseInt("%maxDuration%") * 60 * 1000;

  const profileUrl = `https://www.instagram.com/${username}/`;

  log.info("Params", {
    username,
    search,
    maxResult,
    maxDurationSeconds: maxDuration / 1000,
  });

  log.info("Scraping Instagram", { username });
  log.info("Searching for", { search });
  log.info("Max results", { maxResult });
  log.info("Max duration", { seconds: maxDuration / 1000 });

  // Scrape posts
  log.info("=== Starting post scraping ===");
  const posts = await scrapeInstagramPosts(
    page,
    profileUrl,
    search,
    maxResult,
    maxDuration,
  );
  log.info("=== Post scraping complete ===", { itemsFound: posts.length });

  // Scrape reels
  log.info("=== Starting reel scraping ===");
  const reels = await scrapeInstagramReels(
    page,
    profileUrl,
    search,
    maxResult,
    maxDuration,
  );
  log.info("=== Reel scraping complete ===", { itemsFound: reels.length });

  // Combine results
  const allResults = [...posts, ...reels];

  log.info("=== SUMMARY ===");
  log.info("Total found", { total: allResults.length, search });
  log.info("=== RESULTS ===");

  return allResults;
}
