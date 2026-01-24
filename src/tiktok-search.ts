import { readFile, writeFile } from "fs/promises";
import { connect } from "puppeteer-real-browser";

// Output type matching campaign system expectations
interface TikTokPostData {
  url: string;
  videoId: string;
  description: string;
  hashtags: string[];
  mentions: string[];
  author: {
    id: string;
    uniqueId: string;
    nickname: string;
    avatarUrl: string;
  };
  stats: {
    playCount: number;
    diggCount: number;
    commentCount: number;
    shareCount: number;
    collectCount: number;
  };
  createTime: number;
}

interface SearchOptions {
  profileUrl: string;
  searchType: "hashtag" | "mention";
  searchValue: string;
  maxResult: number;
  maxDuration: number;
}

/**
 * Extract video data from TikTok page's embedded JSON
 * Extracts hashtags from textExtra with type=1
 * Extracts mentions from textExtra with type=0 OR from description regex
 */
async function extractVideoData(page: any): Promise<TikTokPostData | null> {
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
    const hashtags: string[] = [];
    const mentions: string[] = [];

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
    console.log("[extractVideoData] Error:", error);
    return null;
  }
}

/**
 * Check if a post matches the search criteria
 */
function matchesSearch(
  post: TikTokPostData,
  searchType: "hashtag" | "mention",
  searchValue: string
): boolean {
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
  page: any,
  options: SearchOptions
): Promise<TikTokPostData[]> {
  const { profileUrl, searchType, searchValue, maxResult, maxDuration } =
    options;

  console.log(`[TikTok] Navigating to profile: ${profileUrl}`);
  await page.goto(profileUrl, { waitUntil: "networkidle2", timeout: 30000 });

  // Wait for posts to load
  console.log(`[TikTok] Waiting for posts to load`);
  await page.waitForSelector('[data-e2e="user-post-item-list"]', {
    timeout: 30000,
  });
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const results: TikTokPostData[] = [];
  const processedUrls = new Set<string>();
  const startTime = Date.now();

  console.log(
    `[TikTok] Starting search for ${searchType}: ${searchValue}`
  );

  while (results.length < maxResult) {
    // Check timeout
    const elapsedTime = Date.now() - startTime;
    if (elapsedTime > maxDuration) {
      console.log(
        `[TikTok] Timeout: Reached max duration of ${maxDuration / 1000}s`
      );
      break;
    }

    // Extract video URLs from current view
    const videoUrls = await page.evaluate(() => {
      const urls: string[] = [];
      const items = Array.from(document.querySelectorAll('[data-e2e="user-post-item"]'));

      for (const item of items) {
        const link = item.querySelector(
          'a[href*="/video/"]'
        ) as HTMLAnchorElement;
        if (link?.href) {
          urls.push(link.href);
        }
      }

      return urls;
    });

    console.log(`[TikTok] Found ${videoUrls.length} videos in current view`);

    // Process each video
    for (const videoUrl of videoUrls) {
      if (results.length >= maxResult) break;

      // Check timeout
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > maxDuration) {
        console.log(
          `[TikTok] Timeout: Reached max duration of ${maxDuration / 1000}s`
        );
        break;
      }

      if (processedUrls.has(videoUrl)) continue;
      processedUrls.add(videoUrl);

      console.log(
        `[TikTok] Processing video ${processedUrls.size}: ${videoUrl}`
      );

      try {
        // Navigate to video page to extract data
        await page.goto(videoUrl, { waitUntil: "networkidle2", timeout: 20000 });
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const videoData = await extractVideoData(page);

        if (videoData) {
          console.log(
            `[TikTok]   Hashtags: ${videoData.hashtags.join(", ") || "none"}`
          );
          console.log(
            `[TikTok]   Mentions: ${videoData.mentions.join(", ") || "none"}`
          );

          // Check if matches search criteria
          if (matchesSearch(videoData, searchType, searchValue)) {
            results.push(videoData);
            console.log(
              `[TikTok] ✓ Match found! ${results.length}/${maxResult}`
            );
          } else {
            console.log(`[TikTok] ✗ No match for ${searchType}: ${searchValue}`);
          }
        } else {
          console.log(`[TikTok] ✗ Could not extract data from video`);
        }
      } catch (error) {
        console.log(`[TikTok] ✗ Error processing video: ${error}`);
      }

      // Go back to profile (with error handling)
      try {
        await page.goto(profileUrl, { waitUntil: "networkidle2", timeout: 20000 });
        await page.waitForSelector('[data-e2e="user-post-item-list"]', {
          timeout: 20000,
        });
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.log(`[TikTok] Warning: Error returning to profile, retrying...`);
        await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    // Check if we've found enough results
    if (results.length >= maxResult) {
      console.log(`[TikTok] Reached maxResult (${maxResult})`);
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
      console.log("[TikTok] No more posts to load");
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
        "./chrome/chrome/mac_arm-143.0.7499.192/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    },
    args: ["--no-sandbox"],
    turnstile: true,
  });

  // Set viewport
  await page.setViewport({
    width: 1920,
    height: 1080,
  });

  // Load TikTok cookies for authentication
  const cookiesData = await readFile("cookies_tiktok.json", "utf-8");
  const cookies = JSON.parse(cookiesData);
  await page.setCookie(...cookies);

  // Configuration - can be passed as command line args
  const profileUrl = process.argv[2] || "https://www.tiktok.com/@nike";
  const searchType = (process.argv[3] as "hashtag" | "mention") || "mention";
  const searchValue = process.argv[4] || "@jumpman23";
  const maxResult = parseInt(process.argv[5] || "10", 10);
  const maxDuration = 5 * 60 * 1000; // 5 minutes

  console.log(`\n=== TikTok Search ===`);
  console.log(`Profile: ${profileUrl}`);
  console.log(`Search type: ${searchType}`);
  console.log(`Search value: ${searchValue}`);
  console.log(`Max results: ${maxResult}`);
  console.log(`Max duration: ${maxDuration / 1000}s\n`);

  const results = await scrapeTikTokProfile(page, {
    profileUrl,
    searchType,
    searchValue,
    maxResult,
    maxDuration,
  });

  console.log(`\n=== SUMMARY ===`);
  console.log(
    `Found ${results.length} posts with ${searchType}: ${searchValue}`
  );

  console.log(`\n=== RESULTS ===`);
  console.log(JSON.stringify(results, null, 2));

  // Save results to file
  await writeFile(
    "out.tiktok-search.json",
    JSON.stringify(results, null, 2)
  );
  console.log(`\nResults saved to out.tiktok-search.json`);

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
