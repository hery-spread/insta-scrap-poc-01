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

  const cookiesData = await readFile("cookies.json", "utf-8");
  const cookies = JSON.parse(cookiesData);

  await page.setCookie(...cookies);
  // const initialReelUrl = "https://www.instagram.com/reel/DLFp8eaIEFg/";
  const initialReelUrl = "https://www.instagram.com/reel/DSUKwWViHd8/";
  await page.goto(initialReelUrl);

  // Extract the reel code from initial URL
  const initialReelCode = initialReelUrl.split("/").filter(Boolean)[3];
  console.log("[INFO] Initial reel code:", initialReelCode);

  let output = {};

  // Scrap action
  const ogUrl = await page.$eval('meta[property="og:url"]', (el) =>
    el.getAttribute("content"),
  );

  console.log("[INFO] og:url content:", ogUrl);

  // Extract username from og:url and navigate to user's reels page
  const urlParts = ogUrl?.split("/").filter(Boolean);
  const username = urlParts?.[2];
  const reelsUrl = `https://www.instagram.com/${username}/reels`;

  console.log("[INFO] Extracted username:", username);

  await page.goto(reelsUrl);
  console.log("[INFO] Navigated to user's reels page:", reelsUrl);

  // Scroll until we find the initial reel link in DOM
  let scrollAttempts = 0;
  const maxScrollAttempts = 50;
  let foundInitialReel = false;
  let playCount: string | null = null;

  while (!foundInitialReel && scrollAttempts < maxScrollAttempts) {
    console.log(`[INFO] Scrolling... Attempt ${scrollAttempts + 1}`);

    // Check if the reel link exists in the DOM
    const reelData = await page.evaluate((reelCode) => {
      // Find the link containing the reel code
      const links = Array.from(document.querySelectorAll("a"));
      const reelLink = links.find((link) =>
        link.href.includes(`/reel/${reelCode}/`),
      );

      if (reelLink) {
        // Find the view count - look for the span with "View Count Icon" nearby
        const parentDiv = reelLink.closest("div");
        if (parentDiv) {
          // Find all spans with text content
          const spans = Array.from(parentDiv.querySelectorAll("span"));
          // The view count is in a span after the "View Count Icon" svg
          const viewCountIcon = parentDiv.querySelector(
            'svg[aria-label="View Count Icon"]',
          );
          if (viewCountIcon) {
            // Get the next span with text content after the icon
            const iconParent = viewCountIcon.closest("div");
            if (iconParent && iconParent.nextElementSibling) {
              const viewCountSpan =
                iconParent.nextElementSibling.querySelector("span span");
              if (viewCountSpan) {
                return {
                  found: true,
                  playCount: viewCountSpan.textContent?.trim() || null,
                };
              }
            }
          }
        }
        return { found: true, playCount: null };
      }
      return { found: false, playCount: null };
    }, initialReelCode);

    if (reelData.found) {
      foundInitialReel = true;
      playCount = reelData.playCount;
      console.log("[INFO] Found initial reel in DOM!");
      console.log("[INFO] Play count:", playCount);
      break;
    }

    // Scroll down
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    // Wait for new content to load
    await new Promise((resolve) => setTimeout(resolve, 2000));

    scrollAttempts++;
  }

  if (foundInitialReel) {
    console.log("[INFO] Successfully found initial reel after scrolling!");
    console.log("[INFO] Play count (raw):", playCount);

    // Translate play count to number
    if (playCount) {
      const translatedCount = translatePlayCount(playCount);
      console.log("[INFO] Play count (translated):", translatedCount);
    }
  } else {
    console.log(
      `[INFO] Did not find initial reel after ${scrollAttempts} scroll attempts`,
    );
  }

  await browser.close();
}

function translatePlayCount(playCount: string): number {
  const value = playCount.toUpperCase();

  // Remove commas
  const cleanValue = value.replace(/,/g, "");

  // Check for multipliers
  if (cleanValue.endsWith("K")) {
    return parseFloat(cleanValue.replace("K", "")) * 1000;
  } else if (cleanValue.endsWith("M")) {
    return parseFloat(cleanValue.replace("M", "")) * 1000000;
  } else if (cleanValue.endsWith("B")) {
    return parseFloat(cleanValue.replace("B", "")) * 1000000000;
  } else {
    return parseFloat(cleanValue);
  }
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.log("[run] an error occured", error);
    process.exit(1);
  });
