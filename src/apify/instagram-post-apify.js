/* eslint-disable no-undef */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function pageFunction(context) {
  const { page, log } = context;

  await page.setViewport({
    width: 1920,
    height: 1080,
  });

  const url = await page.url();
  log.info("[Post] Current URL", { url });

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

        if (data) {
          output = { url, ...data };
          log.info(
            "[Post] Extracted data from xdt_api__v1__media__shortcode__web_info",
          );
        } else {
          log.info(
            "[Post] xdt_api__v1__media__shortcode__web_info exists but data not found",
          );
        }
      } catch (error) {
        log.info(
          "[Post] xdt_api__v1__media__shortcode__web_info: failed to parse content",
          { error: String(error) },
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

        if (data) {
          output = { url, ...data };
          log.info(
            "[Post] Extracted data from xdt_api__v1__clips__home__connection_v2",
          );
        } else {
          log.info(
            "[Post] xdt_api__v1__clips__home__connection_v2 exists but data not found",
          );
        }
      } catch (error) {
        log.info(
          "[Post] xdt_api__v1__clips__home__connection_v2: failed to parse content",
          { error: String(error) },
        );
      }
      break;
    }
  }

  if (output) {
    log.info("[Post] Successfully extracted post data");

    // Navigate to user profile
    try {
      log.info("[Profile] Navigating to user profile");

      // Use username from extracted data to construct profile URL
      const username = output.user?.username;
      if (username) {
        const profileUrl = `https://www.instagram.com/${username}/`;
        log.info("[Profile] Profile URL", { profileUrl });

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
          log.info("[Profile] Follower count extracted", { followerCount });
          output.user.profile_url = profileUrl;
          output.user.follower_count = followerCount;
        } else {
          log.info("[Profile] Follower count not found");
        }
      } else {
        log.info("[Profile] Username not found in extracted data");
      }
    } catch (error) {
      log.info("[Profile] Failed to extract profile data", {
        error: String(error),
      });
    }
  } else {
    log.info("[Post] No data extracted");
  }

  // Return results as array
  return output ? [output] : [];
}
