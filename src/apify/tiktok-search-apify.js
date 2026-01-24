/* eslint-disable no-undef */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function pageFunction(context) {
  const { page, log } = context;

  /**
   * Extract video data from TikTok page's embedded JSON
   * Extracts hashtags from textExtra with type=1
   * Extracts mentions from textExtra with type=0 OR from description regex
   */
  async function extractVideoData(page) {
    try {
      const jsonData = await page.evaluate(() => {
        const scriptElement = document.querySelector(
          'script#__UNIVERSAL_DATA_FOR_REHYDRATION__'
        );
        if (scriptElement && scriptElement.textContent) {
          return scriptElement.textContent;
        }
        return null;
      });

      if (!jsonData) {
        return null;
      }

      const parsed = JSON.parse(jsonData);
      const itemStruct =
        parsed["__DEFAULT_SCOPE__"]?.["webapp.video-detail"]?.["itemInfo"]?.[
          "itemStruct"
        ];

      if (!itemStruct) {
        return null;
      }

      // Extract hashtags and mentions from textExtra
      const hashtags = [];
      const mentions = [];

      // Check textExtra in itemStruct directly
      if (itemStruct.textExtra && Array.isArray(itemStruct.textExtra)) {
        for (const extra of itemStruct.textExtra) {
          if (extra.type === 1 && extra.hashtagName) {
            // Type 1 = hashtag
            hashtags.push(extra.hashtagName);
          } else if (extra.type === 0 && extra.userUniqueId) {
            // Type 0 = mention
            mentions.push(extra.userUniqueId);
          }
        }
      }

      // Also check textExtra in contents array
      if (itemStruct.contents && Array.isArray(itemStruct.contents)) {
        for (const content of itemStruct.contents) {
          if (content.textExtra && Array.isArray(content.textExtra)) {
            for (const extra of content.textExtra) {
              if (extra.type === 1 && extra.hashtagName) {
                if (!hashtags.includes(extra.hashtagName)) {
                  hashtags.push(extra.hashtagName);
                }
              } else if (extra.type === 0 && extra.userUniqueId) {
                if (!mentions.includes(extra.userUniqueId)) {
                  mentions.push(extra.userUniqueId);
                }
              }
            }
          }
        }
      }

      // Fallback: extract mentions from description text using regex
      const description = itemStruct.desc || "";
      const mentionRegex = /@(\w+)/g;
      let match;
      while ((match = mentionRegex.exec(description)) !== null) {
        const mentionUsername = match[1];
        if (!mentions.includes(mentionUsername)) {
          mentions.push(mentionUsername);
        }
      }

      return {
        url: `https://www.tiktok.com/@${itemStruct.author?.uniqueId}/video/${itemStruct.id}`,
        videoId: itemStruct.id || "",
        description: description,
        hashtags: hashtags,
        mentions: mentions,
        author: {
          id: itemStruct.author?.id || "",
          uniqueId: itemStruct.author?.uniqueId || "",
          nickname: itemStruct.author?.nickname || "",
          avatarUrl:
            itemStruct.author?.avatarLarger ||
            itemStruct.author?.avatarMedium ||
            "",
        },
        stats: {
          playCount: parseInt(
            itemStruct.statsV2?.playCount || itemStruct.stats?.playCount || "0",
            10
          ),
          diggCount: parseInt(
            itemStruct.statsV2?.diggCount || itemStruct.stats?.diggCount || "0",
            10
          ),
          commentCount: parseInt(
            itemStruct.statsV2?.commentCount ||
              itemStruct.stats?.commentCount ||
              "0",
            10
          ),
          shareCount: parseInt(
            itemStruct.statsV2?.shareCount || itemStruct.stats?.shareCount || "0",
            10
          ),
          collectCount: parseInt(
            itemStruct.statsV2?.collectCount ||
              itemStruct.stats?.collectCount ||
              "0",
            10
          ),
        },
        createTime: itemStruct.createTime || 0,
      };
    } catch (error) {
      log.info("[extractVideoData] Error:", { error: String(error) });
      return null;
    }
  }

  /**
   * Check if a post matches the search criteria
   */
  function matchesSearch(post, searchType, searchValue) {
    const searchLower = searchValue.toLowerCase().replace(/^[#@]/, "");

    if (searchType === "hashtag") {
      return post.hashtags.some((h) => h.toLowerCase() === searchLower);
    } else {
      // For mentions, check both structured mentions and description text
      const hasMention = post.mentions.some(
        (m) => m.toLowerCase() === searchLower
      );
      const descHasMention = post.description
        .toLowerCase()
        .includes(`@${searchLower}`);
      return hasMention || descHasMention;
    }
  }

  /**
   * Scrape TikTok profile for posts matching hashtag or mention
   */
  async function scrapeTikTokProfile(
    page,
    profileUrl,
    searchType,
    searchValue,
    maxResult,
    maxDuration
  ) {
    log.info("[TikTok] Navigating to profile:", { profileUrl });
    await page.goto(profileUrl, { waitUntil: "networkidle2", timeout: 30000 });

    // Wait for posts to load
    log.info("[TikTok] Waiting for posts to load");
    await page.waitForSelector('[data-e2e="user-post-item-list"]', {
      timeout: 30000,
    });
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const results = [];
    const processedUrls = new Set();
    const startTime = Date.now();

    log.info("[TikTok] Starting search", { searchType, searchValue });

    while (results.length < maxResult) {
      // Check timeout
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > maxDuration) {
        log.info("[TikTok] Timeout: Reached max duration", {
          maxDurationSeconds: maxDuration / 1000,
        });
        break;
      }

      // Extract video URLs from current view
      const videoUrls = await page.evaluate(() => {
        const urls = [];
        const items = Array.from(document.querySelectorAll('[data-e2e="user-post-item"]'));

        for (const item of items) {
          const link = item.querySelector(
            'a[href*="/video/"]'
          );
          if (link?.href) {
            urls.push(link.href);
          }
        }

        return urls;
      });

      log.info("[TikTok] Found videos in current view", { count: videoUrls.length });

      // Process each video
      for (const videoUrl of videoUrls) {
        if (results.length >= maxResult) break;

        // Check timeout
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime > maxDuration) {
          log.info("[TikTok] Timeout: Reached max duration", {
            maxDurationSeconds: maxDuration / 1000,
          });
          break;
        }

        if (processedUrls.has(videoUrl)) continue;
        processedUrls.add(videoUrl);

        log.info("[TikTok] Processing video", {
          count: processedUrls.size,
          url: videoUrl,
        });

        try {
          // Navigate to video page to extract data
          await page.goto(videoUrl, { waitUntil: "networkidle2", timeout: 20000 });
          await new Promise((resolve) => setTimeout(resolve, 2000));

          const videoData = await extractVideoData(page);

          if (videoData) {
            log.info("[TikTok] Video data extracted", {
              hashtags: videoData.hashtags.join(", ") || "none",
              mentions: videoData.mentions.join(", ") || "none",
            });

            // Check if matches search criteria
            if (matchesSearch(videoData, searchType, searchValue)) {
              results.push(videoData);
              log.info("[TikTok] ✓ Match found!", {
                count: results.length,
                maxResult,
              });
            } else {
              log.info("[TikTok] ✗ No match", { searchType, searchValue });
            }
          } else {
            log.info("[TikTok] ✗ Could not extract data from video");
          }
        } catch (error) {
          log.info("[TikTok] ✗ Error processing video", { error: String(error) });
        }

        // Go back to profile (with error handling)
        try {
          await page.goto(profileUrl, { waitUntil: "networkidle2", timeout: 20000 });
          await page.waitForSelector('[data-e2e="user-post-item-list"]', {
            timeout: 20000,
          });
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } catch (error) {
          log.info("[TikTok] Warning: Error returning to profile, retrying...");
          await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }

      // Check if we've found enough results
      if (results.length >= maxResult) {
        log.info("[TikTok] Reached maxResult", { maxResult });
        break;
      }

      // Get current item count before scrolling
      const currentItemCount = await page.evaluate(() => {
        return document.querySelectorAll('[data-e2e="user-post-item"]').length;
      });

      // Scroll down to load more content
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });

      // Wait for new content to load
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Get new item count
      const newItemCount = await page.evaluate(() => {
        return document.querySelectorAll('[data-e2e="user-post-item"]').length;
      });

      // Break if no new items loaded
      if (newItemCount === currentItemCount) {
        log.info("[TikTok] No more posts to load");
        break;
      }
    }

    return results;
  }

  // Implementation

  await page.setViewport({
    width: 1920,
    height: 1080,
  });

  const url = await page.url();
  log.info("url", { url });

  const searchType = "%searchType%";
  const searchValue = "%searchValue%";
  const maxResult = parseInt("%maxResult%");
  const maxDuration = parseInt("%maxDuration%") * 60 * 1000;

  log.info("params", {
    searchType,
    searchValue,
    maxResult,
    maxDurationSeconds: maxDuration / 1000,
  });

  log.info("=== TikTok Search ===");
  log.info("Profile:", { url });
  log.info("Search type:", { searchType });
  log.info("Search value:", { searchValue });
  log.info("Max results:", { maxResult });
  log.info("Max duration:", { seconds: maxDuration / 1000 });

  const results = await scrapeTikTokProfile(
    page,
    url,
    searchType,
    searchValue,
    maxResult,
    maxDuration
  );

  log.info("=== SUMMARY ===");
  log.info("Total found", { total: results.length, searchType, searchValue });
  log.info("=== RESULTS ===");

  return results;
}
