import { readFile, writeFile } from "fs/promises";
import { connect } from "puppeteer-real-browser";

type Output = {
  // Post identifiers
  id: string;
  createTime: number;

  // Content
  desc: string; // Caption
  hashtags: string[];

  // Author info
  author: {
    id: string;
    uniqueId: string; // Username
    nickname: string; // Display name
    avatarUrl: string;
    signature: string; // Bio
    verified: boolean;
  };

  // Video metadata
  video: {
    duration: number;
    ratio: string;
    coverUrl: string;
    playUrl: string;
    downloadUrl: string;
    width: number;
    height: number;
  };

  // Engagement metrics
  stats: {
    playCount: number; // Views
    diggCount: number; // Likes
    commentCount: number;
    shareCount: number;
    collectCount: number; // Bookmarks/Saves
  };

  // Music/Audio
  music?: {
    id: string;
    title: string;
    authorName: string;
    playUrl: string;
    coverUrl: string;
  };
};

async function run() {
  const { browser, page } = await connect({
    headless: false,
    customConfig: {
      chromePath: "./chrome/chrome/mac_arm-143.0.7499.192/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    },
    args: ["--no-sandbox"],
    turnstile: true,
  });

  // Load TikTok cookies for authentication
  const cookiesData = await readFile("cookies_tiktok.json", "utf-8");
  const cookies = JSON.parse(cookiesData);

  await page.setCookie(...cookies);

  // Get URL from command line args or use example
  const videoUrl = process.argv[2] || "https://www.tiktok.com/@nike/video/7434875912766008577";

  console.log(`[INFO] Navigating to: ${videoUrl}`);
  await page.goto(videoUrl, { waitUntil: "networkidle2", timeout: 30000 });

  // Wait for the page to fully load
  await new Promise((resolve) => setTimeout(resolve, 5000));

  let output: Output | null = null;

  // Method 1: Extract from __UNIVERSAL_DATA_FOR_REHYDRATION__ script tag
  try {
    console.log("[INFO] Attempting to extract data from __UNIVERSAL_DATA_FOR_REHYDRATION__");

    const jsonData = await page.evaluate(() => {
      const scriptElement = document.querySelector(
        'script#__UNIVERSAL_DATA_FOR_REHYDRATION__'
      );
      if (scriptElement && scriptElement.textContent) {
        return scriptElement.textContent;
      }
      return null;
    });

    if (jsonData) {
      const parsed = JSON.parse(jsonData);

      // Save raw JSON for debugging
      await writeFile("out.tiktok.json", JSON.stringify(parsed, null, 2));

      // Navigate to the itemStruct data
      const itemStruct =
        parsed["__DEFAULT_SCOPE__"]?.["webapp.video-detail"]?.["itemInfo"]?.[
          "itemStruct"
        ];

      if (itemStruct) {
        // Extract hashtags from contents array
        const hashtags: string[] = [];
        if (itemStruct.contents && Array.isArray(itemStruct.contents)) {
          for (const content of itemStruct.contents) {
            if (content.textExtra && Array.isArray(content.textExtra)) {
              for (const extra of content.textExtra) {
                if (extra.hashtagName) {
                  hashtags.push(extra.hashtagName);
                }
              }
            }
          }
        }

        // Build comprehensive output
        output = {
          // Post identifiers
          id: itemStruct.id || "",
          createTime: itemStruct.createTime || 0,

          // Content
          desc: itemStruct.desc || "",
          hashtags: hashtags,

          // Author info
          author: {
            id: itemStruct.author?.id || "",
            uniqueId: itemStruct.author?.uniqueId || "",
            nickname: itemStruct.author?.nickname || "",
            avatarUrl: itemStruct.author?.avatarLarger || itemStruct.author?.avatarMedium || "",
            signature: itemStruct.author?.signature || "",
            verified: itemStruct.author?.verified || false,
          },

          // Video metadata
          video: {
            duration: itemStruct.video?.duration || 0,
            ratio: itemStruct.video?.ratio || "",
            coverUrl: itemStruct.video?.cover || "",
            playUrl: itemStruct.video?.playAddr || "",
            downloadUrl: itemStruct.video?.downloadAddr || "",
            width: itemStruct.video?.width || 0,
            height: itemStruct.video?.height || 0,
          },

          // Engagement metrics (using stats or statsV2)
          stats: {
            playCount: parseInt((itemStruct.statsV2?.playCount || itemStruct.stats?.playCount || "0"), 10),
            diggCount: parseInt((itemStruct.statsV2?.diggCount || itemStruct.stats?.diggCount || "0"), 10),
            commentCount: parseInt((itemStruct.statsV2?.commentCount || itemStruct.stats?.commentCount || "0"), 10),
            shareCount: parseInt((itemStruct.statsV2?.shareCount || itemStruct.stats?.shareCount || "0"), 10),
            collectCount: parseInt((itemStruct.statsV2?.collectCount || itemStruct.stats?.collectCount || "0"), 10),
          },

          // Music/Audio (optional)
          music: itemStruct.music ? {
            id: itemStruct.music.id || "",
            title: itemStruct.music.title || "",
            authorName: itemStruct.music.authorName || "",
            playUrl: itemStruct.music.playUrl || "",
            coverUrl: itemStruct.music.coverLarge || itemStruct.music.coverMedium || "",
          } : undefined,
        };

        console.log("[INFO] Successfully extracted from __UNIVERSAL_DATA_FOR_REHYDRATION__");
        console.log(`[INFO] Video ID: ${output.id}`);
        console.log(`[INFO] Author: @${output.author.uniqueId} (${output.author.nickname})`);
        console.log(`[INFO] Caption: ${output.desc.substring(0, 50)}...`);
        console.log(`[INFO] Hashtags: ${hashtags.join(", ")}`);
      } else {
        console.log(
          "[WARN] __UNIVERSAL_DATA_FOR_REHYDRATION__ found but itemStruct not found"
        );
      }
    } else {
      console.log("[WARN] __UNIVERSAL_DATA_FOR_REHYDRATION__ script not found");
    }
  } catch (error) {
    console.log("[ERROR] Failed to parse __UNIVERSAL_DATA_FOR_REHYDRATION__:", error);
  }

  if (output) {
    console.log("\n=== TikTok Video Data ===");
    console.log(JSON.stringify(output, null, 2));
    console.log("\n=== Summary ===");
    console.log(`Video: ${output.id}`);
    console.log(`Author: @${output.author.uniqueId} (${output.author.nickname})`);
    console.log(`Views: ${output.stats.playCount.toLocaleString()}`);
    console.log(`Likes: ${output.stats.diggCount.toLocaleString()}`);
    console.log(`Comments: ${output.stats.commentCount.toLocaleString()}`);
    console.log(`Shares: ${output.stats.shareCount.toLocaleString()}`);
    console.log(`Saves: ${output.stats.collectCount.toLocaleString()}`);
    console.log(`Duration: ${output.video.duration}s`);
    if (output.music) {
      console.log(`Music: ${output.music.title} by ${output.music.authorName}`);
    }
  } else {
    console.log("[ERROR] Failed to extract data - check if cookies are valid and URL is correct");
  }

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
