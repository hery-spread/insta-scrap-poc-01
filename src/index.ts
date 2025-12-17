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
        // "./chrome/mac-142.0.7444.59/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
        "./chrome/linux-143.0.7499.146/chrome-linux64/chrome",
    },
    args: ["--no-sandbox"],
    turnstile: true,
  });

  const cookiesData = await readFile("cookies.json", "utf-8");
  const cookies = JSON.parse(cookiesData);

  await page.setCookie(...cookies);
  await page.goto("https://www.instagram.com/reel/DO0hqB-iBcm/");
  // await page.goto("https://www.instagram.com/p/DSXdx0biPeZ/?img_index=1");

  let output: Output | null = null;
  const scripts = await page.$$("script");
  const scriptsContent: string[] = [];
  for (const scriptHandle of scripts) {
    const content = await page.evaluate((el) => el.textContent, scriptHandle);
    // if (content && content.includes("like_count")) {
    //   scriptsContent.push(scripts.toString());
    //   scriptsContent.push("=========");
    //   scriptsContent.push(
    //     content ? JSON.stringify(JSON.parse(content ?? ""), null, 2) : "",
    //   );
    // }
    // continue;
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
    }
  }

  // await writeFile("script_post.json", scriptsContent.join("\n"));

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
