import * as cheerio from "cheerio";

/**
 * Parses raw HTML and extracts data based on a JSON config of CSS Selectors.
 * @param html The raw HTML string.
 * @param selectors An object of CSS selectors. Must include an "item" key for the container.
 * @returns An array of string-record objects containing the scraped text.
 */
export function parseHTML(html: string, selectors: Record<string, string>): Record<string, string>[] {
    console.log(`[Scraper Parser] Parsing HTML with Cheerio...`);
    const $ = cheerio.load(html);
    const rows: Record<string, string>[] = [];

    if (typeof selectors === "string") {
        $(selectors).each((_, element) => {
            const text = $(element).text().trim();
            if (text) {
                rows.push({ text_content: text });
            }
        });
    } else {
        // The original `if (!selectors.item) { throw ... }` is removed,
        // as the new logic handles the missing 'item' key.

        const extractKeys = Object.keys(selectors).filter(k => k !== 'item');

        if (!selectors.item) {
            // Containerless global extraction (Zip arrays)
            let maxElements = 0;
            const extractedArrays: Record<string, string[]> = {};

            for (const key of extractKeys) {
                const arr = $(selectors[key]).map((_, el) => $(el).text().trim()).get();
                extractedArrays[key] = arr;
                if (arr.length > maxElements) maxElements = arr.length;
            }

            for (let i = 0; i < maxElements; i++) {
                let rowData: Record<string, string> = {};
                let hasData = false;
                for (const key of extractKeys) {
                    if (extractedArrays[key][i]) {
                        rowData[key] = extractedArrays[key][i];
                        hasData = true;
                    }
                }
                if (hasData) rows.push(rowData);
            }
        } else {
            // Iterate through every container that matches the 'item' selector
            $(selectors.item).each((_, element) => {
                let rowData: Record<string, string> = {};
                let hasData = false;

                for (const key of extractKeys) {
                    // Find the sub-element within this specific container
                    const text = $(element).find(selectors[key]).text().trim();
                    if (text) {
                        rowData[key] = text;
                        hasData = true;
                    }
                }

                // Only add rows that actually contained data
                if (hasData) {
                    rows.push(rowData);
                }
            });
        }
    }

    console.log(`[Scraper Parser] Extraction Complete. Generated ${rows.length} rows.`);
    return rows;
}
