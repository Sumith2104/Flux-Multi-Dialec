"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FluxbaseClient = void 0;
exports.createClient = createClient;
class FluxbaseClient {
    constructor(config) {
        if (!config.url || !config.key) {
            throw new Error("FluxbaseClient requires both a 'url' and a 'key' in the configuration.");
        }
        this.url = config.url;
        this.apiKey = config.key;
    }
    /**
     * Executes a raw SQL query against your Fluxbase database.
     * @param sql The SQL query string
     * @returns The JSON data response from the server
     */
    async query(sql) {
        const response = await fetch(this.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({ sql })
        });
        if (!response.ok) {
            let errorMsg = `Fluxbase Query Failed: ${response.status} ${response.statusText}`;
            try {
                const errData = await response.json();
                if (errData.error)
                    errorMsg += ` - ${errData.error}`;
            }
            catch (e) {
                // Ignore parse error
            }
            throw new Error(errorMsg);
        }
        return await response.json();
    }
}
exports.FluxbaseClient = FluxbaseClient;
/**
 * Creates a new Fluxbase client instance
 * @param config { url: string, key: string }
 */
function createClient(config) {
    return new FluxbaseClient(config);
}
