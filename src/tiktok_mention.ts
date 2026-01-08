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

  const cookiesData = await readFile("cookies_tiktok.json", "utf-8");
  const cookies = JSON.parse(cookiesData);

  await page.setCookie(...cookies);
  const mention = "@nike";
  const searchUrl = `https://www.tiktok.com/@lovvveval`;
  await page.goto(searchUrl);

  // Wait for search results to load
  await page.waitForSelector('[data-e2e="user-post-item-list"]', {
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
  const mentionLower = mention.toLowerCase();
  const processedUrls = new Set<string>();

  // Scroll and collect posts until we have maxResult
  const startTime = Date.now();

  while (results.length < maxResult) {
    // Check if duration exceeded
    const elapsedTime = Date.now() - startTime;
    if (elapsedTime > maxDuration) {
      console.log(`Timeout: Reached max duration of ${maxDuration / 1000}s`);
      break;
    }

    // Extract posts from current view
    const posts = await page.evaluate((mentionLower) => {
      const foundPosts: Array<{
        url: string;
        text: string;
        avatarUrl: string;
        username: string;
      }> = [];

      const currentUrl = window.location.href;
      const username = currentUrl.split("/").pop()?.replace("@", "") || "";

      // Extract avatar URL
      const avatarImg = document.querySelector(
        '[data-e2e="user-avatar"] img',
      ) as HTMLImageElement;
      const avatarUrl = avatarImg?.src || "";

      const videoItems = document.querySelectorAll(
        '[data-e2e="user-post-item"]',
      );

      for (const item of videoItems) {
        const itemContainer = item.parentElement;
        if (itemContainer === null) continue;

        const images = itemContainer.querySelectorAll("img");

        let containsMention = false;
        let fullText = "";

        for (const img of images) {
          const text = img.getAttribute("alt") || "";
          fullText += text;
        }

        if (fullText.toLowerCase().includes(mentionLower)) {
          containsMention = true;
        }

        if (containsMention) {
          // Extract URL
          const linkElement = item.querySelector(
            'a[href*="/video/"]',
          ) as HTMLAnchorElement;
          const url = linkElement?.href || "";

          foundPosts.push({
            url,
            text: fullText.trim(),
            username,
            avatarUrl,
          });
        }
      }

      return foundPosts;
    }, mentionLower);

    // Add new unique posts to results
    for (const post of posts) {
      if (!processedUrls.has(post.url) && results.length < maxResult) {
        processedUrls.add(post.url);
        results.push(post);
        console.log(
          `Found post ${results.length}/${maxResult}: ${post.url} by @${post.username}`,
        );
      }
    }

    // Check if we've found enough results
    if (results.length >= maxResult) {
      console.log(`Reached maxResult (${maxResult})`);
      break;
    }

    // Get current item count
    const currentItemCount = await page.evaluate(() => {
      return document.querySelectorAll('[data-e2e="user-post-item"]').length;
    });

    // Scroll down to load more content
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    // Wait for new content to load
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.log(`\nFound ${results.length} posts containing ${mention}`);
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
