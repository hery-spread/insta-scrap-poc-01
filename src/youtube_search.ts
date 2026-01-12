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

async function scrapeFromSearch(
  page: any,
  channelUrl: string,
  search: string,
  maxResult: number,
  maxDuration: number,
  channelInfo: ChannelInfo,
): Promise<SearchResult[]> {
  // Build search URL with encoded query parameter
  const encodedQuery = encodeURIComponent(search);
  const searchUrl = `${channelUrl}/search?query=${encodedQuery}`;

  console.log(`[Search] Navigating to search URL: ${searchUrl}`);
  await page.goto(searchUrl);

  // Wait for search results to load
  console.log(`[Search] Waiting for search results for "${search}"`);
  await page.waitForSelector("#contents", { timeout: 30000 });
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
        `[Search] Timeout: Reached max duration of ${maxDuration / 1000}s`,
      );
      break;
    }

    // Extract content URLs and titles from current view
    const contentItems = await page.evaluate(() => {
      const items: { url: string; title: string }[] = [];
      const titleLinks = document.querySelectorAll('a[id="video-title"][href]');

      for (const link of titleLinks) {
        const href = (link as HTMLAnchorElement).href;
        const title =
          (link as HTMLAnchorElement).getAttribute("title") || "";
        if (href) {
          items.push({ url: href, title });
        }
      }

      return items;
    });

    console.log(`[Search] Found ${contentItems.length} items in search results`);

    // Process each content item
    for (const contentItem of contentItems) {
      const contentUrl = contentItem.url;
      const contentTitle = contentItem.title;
      if (processedUrls.has(contentUrl) || results.length >= maxResult) {
        continue;
      }

      // Check if duration exceeded
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > maxDuration) {
        console.log(
          `[Search] Timeout: Reached max duration of ${maxDuration / 1000}s`,
        );
        break;
      }

      processedUrls.add(contentUrl);

      // Determine content type by URL pattern
      const isShort = contentUrl.includes("/shorts/");
      const contentType = isShort ? "Short" : "Video";

      console.log(`[Search] Checking ${contentType}: ${contentUrl}`);

      // Navigate to content page
      await page.goto(contentUrl);

      // Start with title from search results
      let descriptionText: string[] = [contentTitle];

      if (isShort) {
        // Handle shorts - different HTML structure
        try {
          await page.waitForSelector("#shorts-container", { timeout: 10000 });
          await new Promise((resolve) => setTimeout(resolve, 1500));

          // Try to expand description if there's a "more" button
          const descriptionExpanded = await page.evaluate(() => {
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

          if (descriptionExpanded) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }

          // Extract description text from shorts
          const metapanelText = await page.evaluate(() => {
            const metapanel = document.querySelector("#metapanel");
            return metapanel?.textContent || "";
          });
          descriptionText.push(metapanelText);
        } catch (error) {
          console.log(`[Search] Error extracting short description: ${error}`);
        }
      } else {
        // Handle videos/streams/podcasts - same structure as current implementation
        try {
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

          if (descriptionExpanded) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }

          // Extract description text
          const descriptionElementText = await page.evaluate(() => {
            const descriptionElement = document.querySelector(
              "ytd-text-inline-expander",
            );
            return descriptionElement?.textContent || "";
          });
          descriptionText.push(descriptionElementText);
        } catch (error) {
          console.log(`[Search] Error extracting video description: ${error}`);
        }
      }

      // Check if description contains search term
      const descriptionTextStr = descriptionText.join(" ");
      if (
        descriptionText &&
        descriptionTextStr.toLowerCase().includes(searchLower)
      ) {
        results.push({
          url: contentUrl,
          text: descriptionTextStr.trim(),
          username: channelInfo.username,
          avatarUrl: channelInfo.avatarUrl,
        });

        console.log(
          `[Search] Found ${contentType.toLowerCase()} ${results.length}/${maxResult}: ${contentUrl} by @${channelInfo.username}`,
        );
      }

      // Go back to search results
      await page.goto(searchUrl);
      await page.waitForSelector("#contents", { timeout: 10000 });
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Check if we've found enough results
    if (results.length >= maxResult) {
      console.log(`[Search] Reached maxResult (${maxResult})`);
      break;
    }

    // Get current item count before scrolling
    const currentItemCount = await page.evaluate(() => {
      return document.querySelectorAll('a[id="video-title"]').length;
    });

    // Scroll down to load more content
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    // Wait for new content to load
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Get new item count
    const newItemCount = await page.evaluate(() => {
      return document.querySelectorAll('a[id="video-title"]').length;
    });

    // Break if no new items loaded
    if (newItemCount === currentItemCount) {
      console.log("[Search] No more items to load");
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
  const maxDuration = 1 * 60 * 1000; // 1 minute for search

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
  console.log(`Max duration: ${maxDuration / 1000}s\n`);

  // Scrape using profile search
  console.log("=== Starting profile search ===");
  const allResults = await scrapeFromSearch(
    page,
    channelUrl,
    search,
    maxResult,
    maxDuration,
    channelInfo,
  );
  console.log(
    `=== Profile search complete: ${allResults.length} items found ===\n`,
  );

  console.log(`\n=== SUMMARY ===`);
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
