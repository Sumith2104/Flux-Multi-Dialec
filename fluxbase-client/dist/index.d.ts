export interface FluxbaseConfig {
    url: string;
    key: string;
}
export declare class FluxbaseClient {
    private url;
    private apiKey;
    constructor(config: FluxbaseConfig);
    /**
     * Executes a raw SQL query against your Fluxbase database.
     * @param sql The SQL query string
     * @returns The JSON data response from the server
     */
    query(sql: string): Promise<any>;
}
/**
 * Creates a new Fluxbase client instance
 * @param config { url: string, key: string }
 */
export declare function createClient(config: FluxbaseConfig): FluxbaseClient;
