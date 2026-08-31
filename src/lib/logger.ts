/**
 * Application logger — pino with structured output.
 * Fully compatible with Next.js Turbopack, Webpack, and Serverless runtimes.
 */
import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

const logger = pino({
    level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
        level(label) {
            return { level: label };
        },
    },
    serializers: {
        err: pino.stdSerializers.err,
        error: pino.stdSerializers.err,
    },
}) as pino.Logger & {
    warn(msg: string, ...args: any[]): void;
    error(msg: string, ...args: any[]): void;
    info(msg: string, ...args: any[]): void;
    debug(msg: string, ...args: any[]): void;
};

export default logger;
export const log = logger;
export const { info, warn, error, debug, fatal, child } = logger;
