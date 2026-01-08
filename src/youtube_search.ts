import { readFile } from "fs/promises";
import { connect } from "puppeteer-real-browser";

interface ChannelInfo {
  username: string;
  avatarUrl: string;
}

interface SearchResult {
  url: string;
  text: string;
  avatarUrl: string;
  username: string;
}

async function scrapeVideos(
  page: any,
  channelUrl: string,
  search: string,
  maxResult: number,
  maxDuration: number,
  channelInfo: ChannelInfo,
): Promise<SearchResult[]> {
  let searchUrl = channelUrl;

  // Append /videos if not already present
  if (!searchUrl.endsWith("/videos")) {
    searchUrl += "/videos";
  }

  await page.goto(searchUrl);

  // Wait for search results to load
  await page.waitForSelector("#content", {
    timeout: 30000,
  });

  // Give extra time for videos to render
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const results: SearchResult[] = [];
  const searchLower = search.toLowerCase();
  const processedUrls = new Set<string>();
  const startTime = Date.now();

  while (results.length < maxResult) {
    // Check if duration exceeded
    const elapsedTime = Date.now() - startTime;
    if (elapsedTime > maxDuration) {
      console.log(
        `[Videos] Timeout: Reached max duration of ${maxDuration / 1000}s`,
      );
      break;
    }

    // Extract video URLs from current view
    const videoUrls = await page.evaluate(() => {
      const videos: string[] = [];
      const videoLinks = document.querySelectorAll(
        'a[id="video-title-link"][href*="/watch?v="]',
      );

      for (const link of videoLinks) {
        const href = (link as HTMLAnchorElement).href;
        if (href) {
          videos.push(href);
        }
      }

      return videos;
    });

    // Process each video URL
    for (const videoUrl of videoUrls) {
      if (processedUrls.has(videoUrl) || results.length >= maxResult) {
        continue;
      }

      // Check if duration exceeded
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > maxDuration) {
        console.log(
          `[Videos] Timeout: Reached max duration of ${maxDuration / 1000}s`,
        );
        break;
      }

      processedUrls.add(videoUrl);

      // Navigate to video page
      console.log(`[Videos] Checking video: ${videoUrl}`);
      await page.goto(videoUrl);

      // Wait for description to load
      await page.waitForSelector("#description", { timeout: 10000 });
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Check if description is folded and expand if necessary
      const descriptionExpanded = await page.evaluate(() => {
        const expandButton = document.querySelector(
          'tp-yt-paper-button[id="expand"]',
        ) as HTMLElement;

        if (expandButton && expandButton.textContent?.includes("...more")) {
          expandButton.click();
          return true;
        }
        return false;
      });

      // Wait for expansion if we clicked
      if (descriptionExpanded) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Extract description text
      const descriptionText = await page.evaluate(() => {
        const descriptionElement = document.querySelector(
          "ytd-text-inline-expander",
        );
        return descriptionElement?.textContent || "";
      });

      // Check if description contains search term
      if (descriptionText.toLowerCase().includes(searchLower)) {
        results.push({
          url: videoUrl,
          text: descriptionText.trim(),
          username: channelInfo.username,
          avatarUrl: channelInfo.avatarUrl,
        });

        console.log(
          `[Videos] Found video ${results.length}/${maxResult}: ${videoUrl} by @${channelInfo.username}`,
        );
      }

      // Go back to channel page
      await page.goto(searchUrl);
      await page.waitForSelector("#content", { timeout: 10000 });
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Check if we've found enough results
    if (results.length >= maxResult) {
      console.log(`[Videos] Reached maxResult (${maxResult})`);
      break;
    }

    // Get current video count before scrolling
    const currentVideoCount = await page.evaluate(() => {
      return document.querySelectorAll('a[id="video-title-link"]').length;
    });

    // Scroll down to load more content
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    // Wait for new content to load
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Get new video count
    const newVideoCount = await page.evaluate(() => {
      return document.querySelectorAll('a[id="video-title-link"]').length;
    });

    // Break if no new videos loaded
    if (newVideoCount === currentVideoCount) {
      console.log("[Videos] No more videos to load");
      break;
    }
  }

  return results;
}

async function scrapeShorts(
  page: any,
  channelUrl: string,
  search: string,
  maxResult: number,
  maxDuration: number,
  channelInfo: ChannelInfo,
): Promise<SearchResult[]> {
  let searchUrl = channelUrl;

  // Append /shorts if not already present
  if (!searchUrl.endsWith("/shorts")) {
    searchUrl += "/shorts";
  }

  await page.goto(searchUrl);

  // Wait for shorts to load
  await page.waitForSelector("#contents", {
    timeout: 30000,
  });

  // Give extra time for shorts to render
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const results: SearchResult[] = [];
  const searchLower = search.toLowerCase();
  const processedUrls = new Set<string>();
  const startTime = Date.now();

  while (results.length < maxResult) {
    // Check if duration exceeded
    const elapsedTime = Date.now() - startTime;
    if (elapsedTime > maxDuration) {
      console.log(
        `[Shorts] Timeout: Reached max duration of ${maxDuration / 1000}s`,
      );
      break;
    }

    // Extract short URLs from current view
    const shortUrls = await page.evaluate(() => {
      const shorts: string[] = [];
      const shortLinks = document.querySelectorAll(
        'a.shortsLockupViewModelHostEndpoint[href^="/shorts/"]',
      );

      for (const link of shortLinks) {
        const href = (link as HTMLAnchorElement).href;
        if (href) {
          shorts.push(href);
        }
      }

      return shorts;
    });

    // Process each short URL
    for (const shortUrl of shortUrls) {
      if (processedUrls.has(shortUrl) || results.length >= maxResult) {
        continue;
      }

      // Check if duration exceeded
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > maxDuration) {
        console.log(
          `[Shorts] Timeout: Reached max duration of ${maxDuration / 1000}s`,
        );
        break;
      }

      processedUrls.add(shortUrl);

      // Navigate to short page
      console.log(`[Shorts] Checking short: ${shortUrl}`);
      await page.goto(shortUrl);

      // Wait for short content to load
      await page.waitForSelector("#shorts-container", { timeout: 10000 });
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Try to expand description if there's a "more" button
      const descriptionExpanded = await page.evaluate(() => {
        // Look for description expand button
        const expandButtons = Array.from(
          document.querySelectorAll("button, tp-yt-paper-button"),
        );
        const moreButton = expandButtons.find(
          (btn) =>
            btn.textContent?.toLowerCase().includes("more") ||
            btn.getAttribute("aria-label")?.toLowerCase().includes("more"),
        );

        if (moreButton) {
          (moreButton as HTMLElement).click();
          return true;
        }
        return false;
      });

      // Wait for expansion if we clicked
      if (descriptionExpanded) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Extract description text from shorts
      const descriptionText = await page.evaluate(() => {
        // Try multiple selectors for shorts description
        const descriptionSelectors = ["#metapanel"];

        for (const selector of descriptionSelectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent) {
            return element.textContent;
          }
        }

        return "";
      });

      // Check if description contains search term
      if (
        descriptionText &&
        descriptionText.toLowerCase().includes(searchLower)
      ) {
        results.push({
          url: shortUrl,
          text: descriptionText.trim(),
          username: channelInfo.username,
          avatarUrl: channelInfo.avatarUrl,
        });

        console.log(
          `[Shorts] Found short ${results.length}/${maxResult}: ${shortUrl} by @${channelInfo.username}`,
        );
      }

      // Go back to channel shorts page
      await page.goto(searchUrl);
      await page.waitForSelector("#contents", { timeout: 10000 });
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Check if we've found enough results
    if (results.length >= maxResult) {
      console.log(`[Shorts] Reached maxResult (${maxResult})`);
      break;
    }

    // Get current short count before scrolling
    const currentShortCount = await page.evaluate(() => {
      return document.querySelectorAll(
        'a.shortsLockupViewModelHostEndpoint[href^="/shorts/"]',
      ).length;
    });

    // Scroll down to load more content
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    // Wait for new content to load
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Get new short count
    const newShortCount = await page.evaluate(() => {
      return document.querySelectorAll(
        'a.shortsLockupViewModelHostEndpoint[href^="/shorts/"]',
      ).length;
    });

    // Break if no new shorts loaded
    if (newShortCount === currentShortCount) {
      console.log("[Shorts] No more shorts to load");
      break;
    }
  }

  return results;
}

async function run() {
  const { browser, page } = await connect({
    headless: false,
    customConfig: {
      chromePath:
        // "./chrome/mac-142.0.7444.59/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
        "./chrome/linux-143.0.7499.146/chrome-linux64/chrome",
    },
    args: ["--no-sandbox"],
    turnstile: true,
  });

  // Set viewport to 1920x1080 resolution
  await page.setViewport({
    width: 1920,
    height: 1080,
  });

  const search = "Everything";
  const channelUrl = `https://www.youtube.com/@ThePrimeTimeagen`;

  const maxResult = 100;
  const maxDurationVideos = (1 / 2) * 60 * 1000; // 30 seconds for videos
  const maxDurationShorts = (1 / 2) * 60 * 1000; // 30 seconds for shorts

  // Navigate to channel page to extract channel info
  await page.goto(channelUrl);
  await page.waitForSelector("#content", { timeout: 30000 });
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Extract channel info from the page
  const channelInfo = await page.evaluate(() => {
    // Get avatar from the page header
    const avatarImg = document.querySelector(
      "yt-page-header-view-model img.yt-spec-avatar-shape__image",
    ) as HTMLImageElement;
    const avatarUrl = avatarImg?.src || "";

    // Get username from the page header - look for text starting with @
    const usernameElement = document.querySelector(
      "yt-content-metadata-view-model span.yt-core-attributed-string",
    );
    let username = "";
    if (usernameElement) {
      const text = usernameElement.textContent || "";
      if (text.startsWith("@")) {
        username = text.substring(1); // Remove @ prefix
      }
    }

    return { username, avatarUrl };
  });

  console.log(`Scraping channel: @${channelInfo.username}`);
  console.log(`Searching for: "${search}"`);
  console.log(`Max results: ${maxResult}`);
  console.log(
    `Max duration - Videos: ${maxDurationVideos / 1000}s, Shorts: ${maxDurationShorts / 1000}s\n`,
  );

  // Scrape videos
  console.log("=== Starting video scraping ===");
  const videoResults = await scrapeVideos(
    page,
    channelUrl,
    search,
    maxResult,
    maxDurationVideos,
    channelInfo,
  );
  console.log(
    `=== Video scraping complete: ${videoResults.length} videos found ===\n`,
  );

  // Scrape shorts
  console.log("=== Starting shorts scraping ===");
  const shortResults = await scrapeShorts(
    page,
    channelUrl,
    search,
    maxResult,
    maxDurationShorts,
    channelInfo,
  );
  console.log(
    `=== Shorts scraping complete: ${shortResults.length} shorts found ===\n`,
  );

  // Combine results
  const allResults = [...videoResults, ...shortResults];

  console.log(`\n=== SUMMARY ===`);
  console.log(`Videos found: ${videoResults.length}`);
  console.log(`Shorts found: ${shortResults.length}`);
  console.log(`Total found: ${allResults.length} posts containing "${search}"`);
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
    console.log("[run] an error occured", error);
    process.exit(1);
  });
