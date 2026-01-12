/* eslint-disable no-undef */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function pageFunction(context) {
  const { page, log } = context;

  async function scrapeFromSearch(
    page,
    channelUrl,
    search,
    maxResult,
    maxDuration,
    channelInfo,
  ) {
    // Build search URL with encoded query parameter
    const encodedQuery = encodeURIComponent(search);
    const searchUrl = `${channelUrl}/search?query=${encodedQuery}`;

    log.info("[Search] Navigating to search URL", { searchUrl });
    await page.goto(searchUrl);

    // Wait for search results to load
    log.info("[Search] Waiting for search results", { search });
    await page.waitForSelector("#contents", { timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const results = [];
    const searchLower = search.toLowerCase();
    const processedUrls = new Set();
    const startTime = Date.now();

    while (results.length < maxResult) {
      // Check if duration exceeded
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > maxDuration) {
        log.info("[Search] Timeout: Reached max duration", {
          maxDurationSeconds: maxDuration / 1000,
        });
        break;
      }

      // Extract content URLs, titles, and durations from current view
      const contentItems = await page.evaluate(() => {
        const items = [];
        const videoRenderers = document.querySelectorAll("ytd-video-renderer");

        for (const renderer of videoRenderers) {
          const titleLink = renderer.querySelector(
            'a[id="video-title"][href]',
          );
          const durationElement = renderer.querySelector(".yt-badge-shape__text");

          if (titleLink) {
            const href = titleLink.href;
            const title = titleLink.getAttribute("title") || "";
            const duration = durationElement?.textContent?.trim() || "";

            if (href) {
              items.push({ url: href, title, duration });
            }
          }
        }

        return items;
      });

      log.info("[Search] Found items in search results", {
        count: contentItems.length,
      });

      // Process each content item
      for (const contentItem of contentItems) {
        const contentUrl = contentItem.url;
        const contentTitle = contentItem.title;
        const contentDuration = contentItem.duration;
        if (processedUrls.has(contentUrl) || results.length >= maxResult) {
          continue;
        }

        // Check if duration exceeded
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime > maxDuration) {
          log.info("[Search] Timeout: Reached max duration", {
            maxDurationSeconds: maxDuration / 1000,
          });
          break;
        }

        processedUrls.add(contentUrl);

        // Determine content type by URL pattern
        const isShort = contentUrl.includes("/shorts/");
        const contentType = isShort ? "Short" : "Video";

        log.info(`[Search] Checking ${contentType}`, { contentUrl });

        // Navigate to content page
        await page.goto(contentUrl);

        // Start with title from search results
        let descriptionText = [contentTitle];

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
                moreButton.click();
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
            log.info("[Search] Error extracting short description", { error: String(error) });
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
              );

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
            log.info("[Search] Error extracting video description", { error: String(error) });
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
            duration: contentDuration,
          });

          log.info(`[Search] Found ${contentType.toLowerCase()}`, {
            count: results.length,
            maxResult,
            contentUrl,
            username: channelInfo.username,
          });
        }

        // Go back to search results
        await page.goto(searchUrl);
        await page.waitForSelector("#contents", { timeout: 20000 });
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Check if we've found enough results
      if (results.length >= maxResult) {
        log.info("[Search] Reached maxResult", { maxResult });
        break;
      }

      // Get current item count before scrolling
      const currentItemCount = await page.evaluate(() => {
        return document.querySelectorAll('a[id="video-title"]').length;
      });

      // Scroll down to load more content (use ytd-app element, not document.body)
      await page.evaluate(() => {
        const ytdApp = document.querySelector("ytd-app");
        if (ytdApp) {
          window.scrollTo(0, ytdApp.scrollHeight);
        }
      });

      // Wait for new content to load
      await new Promise((resolve) => setTimeout(resolve, 10000));

      // Get new item count
      const newItemCount = await page.evaluate(() => {
        return document.querySelectorAll('a[id="video-title"]').length;
      });

      // Break if no new items loaded
      if (newItemCount === currentItemCount) {
        log.info("[Search] No more items to load");
        break;
      }
    }

    return results;
  }

  // Implemenation

  await page.setViewport({
    width: 1920,
    height: 1080,
  });

  const url = await page.url();
  log.info("url", { url });

  const maxResult = parseInt("%maxResult%");
  const search = "%search%";
  const maxDuration = parseInt("%maxDuration%") * 60 * 1000;

  log.info("params", {
    maxResult,
    maxDuration,
    search,
  });

  // Navigate to channel page to extract channel info
  await page.goto(url);
  await page.waitForSelector("#content", { timeout: 30000 });
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Extract channel info from the page
  const channelInfo = await page.evaluate(() => {
    // Get avatar from the page header
    const avatarImg = document.querySelector(
      "yt-page-header-view-model img.yt-spec-avatar-shape__image",
    );
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

  log.info("Scraping channel", { username: channelInfo.username });
  log.info("Searching for", { search });
  log.info("Max results", { maxResult });
  log.info("Max duration", { seconds: maxDuration / 1000 });

  // Scrape using profile search
  log.info("=== Starting profile search ===");
  const allResults = await scrapeFromSearch(
    page,
    url,
    search,
    maxResult,
    maxDuration,
    channelInfo,
  );
  log.info("=== Profile search complete ===", {
    itemsFound: allResults.length,
  });

  log.info("=== SUMMARY ===");
  log.info("Total found", { total: allResults.length, search });
  log.info("=== RESULTS ===");

  return allResults;
}
