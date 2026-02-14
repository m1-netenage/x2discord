import { chromium } from "playwright";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";

// Settings via environment variables
// NOTE: You can provide these via a `.env` file and run with:
//   node --env-file=.env x2discord.mjs
const HASHTAGS = (process.env.HASHTAG || "animaymg")
  .split(",")
  .map((t) => t.trim().replace(/^#/, ""))
  .filter(Boolean);
if (HASHTAGS.length === 0) HASHTAGS.push("animaymg");
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const POLL_SECONDS = Number(process.env.POLL_SECONDS || 30);
const MAX_TEXT_LEN_RAW = Number(process.env.MAX_TEXT_LEN || 0);
const MAX_TEXT_LEN =
  Number.isFinite(MAX_TEXT_LEN_RAW) && MAX_TEXT_LEN_RAW > 0
    ? MAX_TEXT_LEN_RAW
    : null; // null => 無制限
const SEEN_PATH = process.env.SEEN_PATH || "./seen_ids.txt";
const OVERLAY_POST_URL = process.env.OVERLAY_POST_URL || "http://localhost:3000/overlay/message";
const OVERLAY_ENABLED = (process.env.OVERLAY_ENABLED || "1") === "1";

const HEADLESS = (process.env.HEADLESS || "true").toLowerCase() !== "false";
const STORAGE_PATH = process.env.STORAGE_PATH || "./storageState.json";
const INIT_LOGIN = (process.env.INIT_LOGIN || "0") === "1";
const DEBUG_POST = (process.env.DEBUG_POST || "0") === "1";

if (!INIT_LOGIN && !WEBHOOK_URL) {
  console.error("[x2discord] DISCORD_WEBHOOK_URL が未設定です (.env を作ってください)");
  console.error("例: DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/... ");
  process.exit(1);
}

const searchUrl = (tags) => {
  if (!tags || tags.length === 0) tags = ["animaymg"];
  if (tags.length === 1) {
    return `https://x.com/search?q=%23${encodeURIComponent(tags[0])}&f=live`;
  }
  const joined = tags
    .map((t) => `%23${encodeURIComponent(t)}`)
    .map((q) => `(${q})`)
    .join("%20OR%20");
  return `https://x.com/search?q=${joined}&f=live`;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const TAG_RES = HASHTAGS.map((t) => new RegExp(`[＃#]${escRe(t)}`, "i"));

const normalizeText = (t) => {
  if (!t) return "";
  // remove URLs
  let s = t.replace(/https?:\/\/\S+/g, "");
  // remove hashtags (全ての # / ＃ で始まるトークン)
  s = s.replace(/[＃#][\p{L}\p{N}_]+/gu, "");
  // collapse whitespace/newlines
  s = s.replace(/\s+/g, " ").trim();
  // cut long text
  if (MAX_TEXT_LEN && s.length > MAX_TEXT_LEN) s = s.slice(0, MAX_TEXT_LEN) + "…";
  return s;
};

async function postDiscord(payload) {
  if (!WEBHOOK_URL) return;
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error("[x2discord] Webhook POST failed:", res.status, txt);
  }
}

async function postOverlay(payload) {
  if (!OVERLAY_ENABLED || !OVERLAY_POST_URL) return;
  try {
    await fetch(OVERLAY_POST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // overlay は補助機能なので失敗しても無視
  }
}

(async () => {
  const url = searchUrl(HASHTAGS);
  console.log("[x2discord] Watching:", url);
  console.log(
    `[x2discord] poll=${POLL_SECONDS}s maxLen=${MAX_TEXT_LEN} (stop: Ctrl+C)`
  );

  // load seen IDs for permanent dedup
  const seenIds = new Set();
  if (existsSync(SEEN_PATH)) {
    try {
      const lines = readFileSync(SEEN_PATH, "utf8")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      for (const id of lines) seenIds.add(id);
      console.log(`[x2discord] loaded ${seenIds.size} seen IDs from ${SEEN_PATH}`);
    } catch (e) {
      console.warn("[x2discord] failed to read seen IDs:", e?.message || e);
    }
  }

  let browser = null;
  let context = null;
  let page = null;

  const launchRuntime = async () => {
    browser = await chromium.launch({
      headless: INIT_LOGIN ? false : HEADLESS,
      args: ["--disable-blink-features=AutomationControlled"],
    });
    // If you run with INIT_LOGIN=1, the browser will open so you can log into X once.
    // After login, press Enter in the terminal to save cookies to STORAGE_PATH.
    context = await browser.newContext({
      storageState: !INIT_LOGIN ? (existsSync(STORAGE_PATH) ? STORAGE_PATH : undefined) : undefined,
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      locale: "ja-JP",
    });
    page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });
  };

  const recreateRuntime = async (reason) => {
    console.warn(`[x2discord] recreating browser session: ${reason}`);
    try {
      if (context) await context.close();
    } catch {
      // ignore
    }
    try {
      if (browser) await browser.close();
    } catch {
      // ignore
    }
    browser = null;
    context = null;
    page = null;
    await launchRuntime();
  };

  const ensureRuntime = async () => {
    if (!browser || !browser.isConnected() || !page || page.isClosed()) {
      await recreateRuntime("page/context/browser closed");
    }
  };

  try {
    await launchRuntime();
  } catch (e) {
    const msg = e?.message || String(e);
    console.error("[x2discord] browser launch failed:", msg);
    if (/Executable doesn't exist|browserType\.launch/i.test(msg)) {
      console.error("[x2discord] Playwright Chromium が未導入の可能性があります。自動セットアップを試します。");
      try {
        execSync("npx playwright install chromium", {
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        });
        console.error("[x2discord] Chromium のセットアップ完了。再起動します。");
        await launchRuntime();
      } catch (installErr) {
        console.error("[x2discord] Chromium セットアップに失敗:", installErr?.message || installErr);
        console.error("[x2discord] 手動実行: npx playwright install chromium");
        process.exit(1);
      }
    } else {
      process.exit(1);
    }
  }

  if (INIT_LOGIN) {
    console.log("\n[x2discord] INIT_LOGIN=1: Xにログインしてから、このターミナルで Enter を押して cookies を保存してね");
    console.log(`[x2discord] 保存先: ${STORAGE_PATH}`);

    // Wait for user to hit Enter
    await new Promise((resolve) => {
      process.stdin.setEncoding("utf8");
      process.stdin.once("data", () => resolve());
    });

    await context.storageState({ path: STORAGE_PATH });
    console.log("[x2discord] storageState saved. いったん終了して、INIT_LOGIN=0で起動し直してOK\n");
    await browser.close();
    process.exit(0);
  }

  async function tick() {
    try {
      await ensureRuntime();

      // Encourage refresh by small scroll
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(700);
      await page.mouse.wheel(0, -800);
      await page.waitForTimeout(700);

      // Grab visible tweet texts and status IDs
      const items = await page.$$eval("article", (nodes) =>
        nodes
          .map((article) => {
            const textNode = article.querySelector('[data-testid="tweetText"]');
            const text = textNode ? textNode.innerText : "";
            const link = article.querySelector('a[href*="/status/"]');

            // Derive tweet id + author handle from the status link (/handle/status/123…)
            const href = link?.getAttribute("href") || "";
            const match = href.match(/^\/([^/]+)\/status\/(\d+)/);
            const handle = match?.[1] || null;
            const id = match?.[2] || null;

            // Display name
            const nameNode = article.querySelector('div[data-testid="User-Name"] span');
            const displayName = nameNode?.innerText || null;

            // Try to grab avatar (profile_images URL is relatively stable)
            const avatarImg =
              article.querySelector('img[src*="profile_images"]') ||
              article.querySelector('div[data-testid="User-Avatar"] img');
            const avatar = avatarImg?.getAttribute("src") || null;

            return { id, text, handle, displayName, avatar };
          })
          .filter((x) => x.text)
      );

      if (items.length === 0) {
        const pageTitle = await page.title().catch(() => "");
        const bodySnippet = await page.textContent("body").catch(() => "");
        const hint = (bodySnippet || "").includes("Log in") || (bodySnippet || "").includes("ログイン")
          ? "(Xのログイン壁の可能性あり)"
          : "";
        console.warn(`[x2discord] tweets not found ${hint} title="${pageTitle}"`);
      }

      // Check a few latest visible
      for (const item of items.slice(0, 10)) {
        const { id, text: raw, handle, displayName, avatar } = item;
        if (!id) continue; // avoid false positives
        if (seenIds.has(id)) continue;

        // ensure the original tweet text contains at least one target hashtag
        if (!TAG_RES.some((re) => re.test(raw))) continue;

        const text = normalizeText(raw);
        if (!text) continue;

        // Send to Discord (ハッシュタグ文字は送らない)
        // Webhookの表示を「アイコン + アカウント名 + 本文」に合わせる
        // オーバーレイ側が content を読むため content は必ず埋める
        const payload = {
          content: text,
          username: displayName || (handle ? `@${handle}` : undefined),
          avatar_url: avatar || undefined,
          handle: handle ? `@${handle}` : undefined,
        };
        if (DEBUG_POST) {
          console.log(
            `[x2discord] send id=${id} user=${payload.username || "-"} avatar=${payload.avatar_url ? "yes" : "no"}`
          );
        }
        await postDiscord(payload);
        await postOverlay({ id, ...payload });

        seenIds.add(id);
        try {
          appendFileSync(SEEN_PATH, `${id}\n`);
        } catch (e) {
          console.warn("[x2discord] failed to persist seen ID:", e?.message || e);
        }

        // gentle pacing
        await sleep(400);
      }
    } catch (e) {
      const msg = e?.message || String(e);
      console.error("[x2discord] tick error:", msg);
      if (/has been closed|Target page, context or browser has been closed/i.test(msg)) {
        try {
          await recreateRuntime("detected closed target in tick");
        } catch (recreateErr) {
          console.error("[x2discord] recreate failed:", recreateErr?.message || recreateErr);
        }
        return;
      }
      // If something goes wrong, try reload
      try {
        await page.reload({ waitUntil: "domcontentloaded" });
      } catch {
        // ignore
      }
    }
  }

  while (true) {
    await tick();
    await sleep(POLL_SECONDS * 1000);
  }
})();
