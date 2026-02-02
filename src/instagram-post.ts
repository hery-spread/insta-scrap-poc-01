import { readFile, writeFile } from "fs/promises";
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

  await page.setViewport({
    width: 1920,
    height: 1080,
  });

  const cookiesData = await readFile("cookies.json", "utf-8");
  const cookies = JSON.parse(cookiesData);

  await page.setCookie(...cookies);
  await page.goto("https://www.instagram.com/reel/DO0hqB-iBcm/");
  // await page.goto("https://www.instagram.com/p/DSXdx0biPeZ/?img_index=1");

  const url = await page.url();
  console.log("[INFO] url", url);
  let output = null;
  const scripts = await page.$$("script");
  for (const scriptHandle of scripts) {
    const content = await page.evaluate((el) => el.textContent, scriptHandle);
    if (
      content &&
      content.includes("xdt_api__v1__media__shortcode__web_info")
    ) {
      try {
        const json = JSON.parse(content);
        const data =
          json?.require?.[0]?.[3]?.[0]?.__bbox?.require?.[0]?.[3]?.[1]?.__bbox
            ?.result?.data?.xdt_api__v1__media__shortcode__web_info?.items?.[0];

        await writeFile("out.reel.json", JSON.stringify(data, null, 2));
        if (data) {
          output = { url, ...data };
        } else {
          console.log(
            "[WARN] xdt_api__v1__media__shortcode__web_info exist but data not found",
            json,
          );
        }
      } catch (error) {
        console.log(
          "[ERROR] xdt_api__v1__media__shortcode__web_info: failed to parse content",
          error,
        );
      }
      break;
    } else if (
      content &&
      content.includes("xdt_api__v1__clips__home__connection_v2")
    ) {
      try {
        const json = JSON.parse(content);
        const data =
          json?.require?.[0]?.[3]?.[0]?.__bbox?.require?.[0]?.[3]?.[1]?.__bbox
            ?.result?.data?.xdt_api__v1__clips__home__connection_v2?.edges?.[0]
            .node?.media;
        await writeFile("out.reel_2.json", JSON.stringify(data, null, 2));
        if (data) {
          output = { url, ...data };
        } else {
          console.log(
            "[WARN] xdt_api__v1__clips__home__connection_v2 exist but data not found",
            json,
          );
        }
      } catch (error) {
        console.log(
          "[ERROR] xdt_api__v1__clips__home__connection_v2: failed to parse content",
          error,
        );
      }
      break;
    }
  }

  if (output) {
    console.log("[INFO] success!", output);

    // Navigate to user profile
    try {
      console.log("[INFO] Navigating to user profile...");

      // Use username from extracted data to construct profile URL
      const username = output.user?.username;
      if (username) {
        const profileUrl = `https://www.instagram.com/${username}/`;
        console.log("[INFO] Profile URL:", profileUrl);

        // Navigate to profile page
        await page.goto(profileUrl);
        await page.waitForSelector('a[href*="/followers/"]', {
          timeout: 10000,
        });

        // Extract real follower count from title attribute
        const followerCount = await page.evaluate(() => {
          const followerLink = document.querySelector(
            'a[href*="/followers/"] span[title]',
          );
          const title = followerLink
            ? followerLink.getAttribute("title")
            : null;
          // Remove comma separators
          return title ? title.replace(/,/g, "") : null;
        });

        if (followerCount) {
          console.log("[INFO] Follower count:", followerCount);
          output.user.profile_url = profileUrl;
          output.user.follower_count = followerCount;
        } else {
          console.log("[WARN] Follower count not found");
        }
      } else {
        console.log("[WARN] Profile link not found");
      }
    } catch (error) {
      console.log("[ERROR] Failed to extract profile data:", error);
    }
  } else {
    console.log("[INFO] empty data", output);
  }
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
