import { chromium } from "playwright";

/**
 * Headlessly fetches a webpage and waits for network idling.
 * @param url The target website URL to scrape.
 * @returns The fully rendered HTML source string.
 */
export async function fetchPage(url: string): Promise<string> {
    console.log(`[Scraper Fetcher] Launching Chromium to fetch: ${url}`);

    // Launch headless chromium instance
    const browser = await chromium.launch({ headless: true });

    try {
        const context = await browser.newContext();
        const page = await context.newPage();

        // Wait for all network connections to idle to ensure JS-rendered content is loaded
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });

        const html = await page.content();
        return html;
    } finally {
        // ALWAYS close the browser to prevent memory leaks
        await browser.close();
    }
}
