import { readFile } from "fs/promises";
import { connect } from "puppeteer-real-browser";

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

  const search = "Teejs 2nd Prediction";
  let searchUrl = `https://www.youtube.com/@ThePrimeTimeagen`;

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

  const maxResult = 100;
  const maxDuration = (1 / 2) * 60 * 1000;
  const results: Array<{
    url: string;
    text: string;
    avatarUrl: string;
    username: string;
  }> = [];

  // Extract posts that contain the mention (case-insensitive)
  const searchLower = search.toLowerCase();
  const processedUrls = new Set<string>();

  // Scroll and collect posts until we have maxResult
  const startTime = Date.now();

  // Extract channel info from the page
  const channelInfo = await page.evaluate(() => {
    // Get avatar from the page header
    const avatarImg = document.querySelector(
      'yt-page-header-view-model img.yt-spec-avatar-shape__image',
    ) as HTMLImageElement;
    const avatarUrl = avatarImg?.src || "";

    // Get username from the page header - look for text starting with @
    const usernameElement = document.querySelector(
      'yt-content-metadata-view-model span.yt-core-attributed-string',
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

  while (results.length < maxResult) {
    // Check if duration exceeded
    const elapsedTime = Date.now() - startTime;
    if (elapsedTime > maxDuration) {
      console.log(`Timeout: Reached max duration of ${maxDuration / 1000}s`);
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
        console.log(`Timeout: Reached max duration of ${maxDuration / 1000}s`);
        break;
      }

      processedUrls.add(videoUrl);

      // Navigate to video page
      console.log(`Checking video: ${videoUrl}`);
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
          `Found video ${results.length}/${maxResult}: ${videoUrl} by @${channelInfo.username}`,
        );
      }

      // Go back to channel page
      await page.goto(searchUrl);
      await page.waitForSelector("#content", { timeout: 10000 });
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Check if we've found enough results
    if (results.length >= maxResult) {
      console.log(`Reached maxResult (${maxResult})`);
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
      console.log("No more videos to load");
      break;
    }
  }

  console.log(`\nFound ${results.length} posts containing ${search}`);
  console.log(JSON.stringify(results, null, 2));

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
