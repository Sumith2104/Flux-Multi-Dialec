/**
 * OpenAPI 3.0 specification generator for Fluxbase API.
 */

export function generateOpenAPISpec(): Record<string, any> {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const unauthorized = {
        description: 'Unauthorized',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
    };
    const forbidden = {
        description: 'Forbidden',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
    };
    const notFound = {
        description: 'Not Found',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
    };
    const serverError = {
        description: 'Internal Server Error',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
    };

    return {
        openapi: '3.0.3',
        info: {
            title: 'Fluxbase API',
            version: '0.1.0',
            description: 'Multi-tenant serverless SQL platform API',
        },
        servers: [{ url: baseUrl, description: 'Fluxbase API' }],
        components: {
            securitySchemes: {
                bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
                apiKeyAuth: { type: 'apiKey', in: 'header', name: 'x-api-key' },
            },
            schemas: {
                Error: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: false },
                        error: {
                            type: 'object',
                            properties: {
                                message: { type: 'string' },
                                code: { type: 'string' },
                            },
                        },
                    },
                },
            },
            responses: { unauthorized, forbidden, notFound, serverError },
        },
        paths: {
            '/api/execute-sql': {
                post: {
                    summary: 'Execute SQL',
                    tags: ['SQL'],
                    security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { type: 'object', required: ['projectId', 'sql'], properties: { projectId: { type: 'string' }, sql: { type: 'string' }, params: { type: 'array', items: {} } } } } },
                    },
                    responses: { '200': { description: 'Query result' }, '401': unauthorized, '500': serverError },
                },
            },
            '/api/v1/rest/{projectId}/{table}': {
                get: {
                    summary: 'List rows',
                    tags: ['REST'],
                    security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
                    parameters: [
                        { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                        { name: 'table', in: 'path', required: true, schema: { type: 'string' } },
                        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
                        { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
                        { name: 'order_by', in: 'query', schema: { type: 'string' } },
                        { name: 'order_dir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'asc' } },
                    ],
                    responses: { '200': { description: 'Paginated rows' }, '401': unauthorized },
                },
                post: {
                    summary: 'Insert row',
                    tags: ['REST'],
                    security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
                    parameters: [
                        { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                        { name: 'table', in: 'path', required: true, schema: { type: 'string' } },
                    ],
                    requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
                    responses: { '201': { description: 'Created row' }, '401': unauthorized, '403': forbidden },
                },
                put: {
                    summary: 'Update row',
                    tags: ['REST'],
                    security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
                    parameters: [
                        { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                        { name: 'table', in: 'path', required: true, schema: { type: 'string' } },
                    ],
                    requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' } } } } } },
                    responses: { '200': { description: 'Updated row' }, '401': unauthorized, '403': forbidden, '404': notFound },
                },
                delete: {
                    summary: 'Delete row',
                    tags: ['REST'],
                    security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
                    parameters: [
                        { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                        { name: 'table', in: 'path', required: true, schema: { type: 'string' } },
                        { name: 'id', in: 'query', required: true, schema: { type: 'string' } },
                    ],
                    responses: { '200': { description: 'Deleted' }, '401': unauthorized, '403': forbidden },
                },
            },
            '/api/auth/refresh': {
                post: {
                    summary: 'Refresh access token',
                    tags: ['Auth'],
                    responses: { '200': { description: 'New access token' }, '401': { description: 'Invalid or expired refresh token' } },
                },
            },
            '/api/fast-insert': {
                post: {
                    summary: 'Fast bulk insert',
                    tags: ['SQL'],
                    security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
                    requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
                    responses: { '200': { description: 'Insert result' }, '401': unauthorized },
                },
            },
            '/api/schema': {
                get: {
                    summary: 'Get project schema',
                    tags: ['Schema'],
                    security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
                    parameters: [{ name: 'projectId', in: 'query', required: true, schema: { type: 'string' } }],
                    responses: { '200': { description: 'Schema info' }, '401': unauthorized },
                },
            },
            '/api/metrics': {
                get: {
                    summary: 'Prometheus metrics',
                    tags: ['System'],
                    responses: { '200': { description: 'Prometheus text format' } },
                },
            },
            '/api/docs': {
                get: {
                    summary: 'OpenAPI specification',
                    tags: ['System'],
                    responses: { '200': { description: 'OpenAPI 3.0 JSON' } },
                },
            },
        },
    };
}
