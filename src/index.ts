import { readFile, writeFile } from "fs/promises";
import { connect } from "puppeteer-real-browser";

type Output = {
  like_count: number;
  comment_count: number;
};

async function run() {
  const { browser, page } = await connect({
    headless: false,
    customConfig: {
      chromePath:
        "./chrome/mac-142.0.7444.59/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    },
    args: ["--no-sandbox"],
    turnstile: true,
  });

  const cookiesData = await readFile("cookies.json", "utf-8");
  const cookies = JSON.parse(cookiesData);

  await page.setCookie(...cookies);
  await page.goto("https://www.instagram.com/reel/DO0hqB-iBcm/");

  let output: Output | null = null;
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
          output = {
            like_count: data.like_count,
            comment_count: data.comment_count,
          };
        } else {
          console.log(
            "[WARN] xdt_api__v1__media__shortcode__web_info exist but data not found",
            json,
          );
        }
      } catch (error) {
        console.log("[ERROR] failed to parse content", error);
      }
      break;
    }
  }

  if (output) {
    console.log("[INFO] success!", output);
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
