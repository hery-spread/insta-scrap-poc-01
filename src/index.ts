import { connect } from "puppeteer-real-browser";

async function run() {
  const { browser, page } = await connect({
    headless: false,
    customConfig: { chromePath: "./chrome/mac-142.0.7444.59/chrome-mac-x64/" },
    args: ["--no-sandbox"],
    turnstile: true,
  });
  await page.goto("https://www.instagram.com/p/DQjdgPsiI78/");
  await new Promise((resolve) => setTimeout(resolve, 3000));
  await browser.close();
}

run().catch((error) => {
  console.log("[run] an error occured", error);
});
