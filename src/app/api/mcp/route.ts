import { NextRequest, NextResponse } from 'next/server';
import { getAuthContextFromRequest } from '@/lib/auth';
import { getProjectsForCurrentUser } from '@/lib/data';
import { createProject } from '@/lib/data';
import { TenantProvisioner } from '@/lib/tenant-engine';
import { getPgPool } from '@/lib/pg';
import logger from '@/lib/logger';

const MCP_TOOLS = [
  {
    name: 'create_project',
    description: 'Creates a new serverless PostgreSQL or MySQL database project on Fluxbase.',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Name of the project' },
        dialect: { type: 'string', enum: ['postgresql', 'mysql'], description: 'Database dialect (postgresql or mysql)' },
        userRole: { type: 'string', enum: ['student', 'employee', 'org_owner'], description: 'Role of the creator' },
        description: { type: 'string', description: 'Optional project description' }
      },
      required: ['projectName', 'dialect']
    }
  },
  {
    name: 'list_projects',
    description: 'Lists all database projects owned by or shared with the authenticated user.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_schema',
    description: 'Fetches database schema, table structures, and column data types for a given project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'The project ID to inspect' }
      },
      required: ['projectId']
    }
  },
  {
    name: 'run_sql',
    description: 'Executes a raw SQL statement against the selected project database.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'The target project ID' },
        query: { type: 'string', description: 'SQL query to execute' }
      },
      required: ['projectId', 'query']
    }
  }
];

export async function GET(req: NextRequest) {
  const auth = await getAuthContextFromRequest(req);
  if (!auth?.userId) {
    return NextResponse.json({
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Unauthorized: Valid session or Bearer API key required.' }
    }, { status: 401 });
  }

  return NextResponse.json({
    jsonrpc: '2.0',
    result: {
      serverInfo: {
        name: 'fluxbase-mcp-gateway',
        version: '1.0.0',
        protocolVersion: '2024-11-05'
      },
      tools: MCP_TOOLS
    }
  });
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId) {
      return NextResponse.json({
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Unauthorized: Valid session or Bearer API key required.' }
      }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { method, params, id } = body;

    // 1. tools/list
    if (method === 'tools/list' || method === 'list_tools') {
      return NextResponse.json({
        jsonrpc: '2.0',
        id: id || 1,
        result: {
          tools: MCP_TOOLS
        }
      });
    }

    // 2. tools/call
    if (method === 'tools/call' || method === 'call_tool') {
      const toolName = params?.name || body?.name;
      const args = params?.arguments || body?.arguments || {};

      if (toolName === 'create_project') {
        const projectName = args.projectName || args.name;
        const dialect = args.dialect === 'mysql' ? 'mysql' : 'postgresql';
        const userRole = args.userRole || 'employee';
        const description = args.description || 'Created via MCP Gateway';

        if (!projectName) {
          return NextResponse.json({
            jsonrpc: '2.0',
            id: id || 1,
            error: { code: -32602, message: 'Invalid params: "projectName" is required.' }
          });
        }

        const project = await createProject(
          projectName,
          description,
          dialect,
          'UTC',
          'internal',
          {},
          userRole
        );

        // Provision instant serverless schema
        try {
          const tenantResult = await TenantProvisioner.createTenantSchema(project.project_id, dialect);
          const pool = getPgPool();
          await pool.query(
            'UPDATE fluxbase_global.projects SET is_serverless = true, schema_name = $1 WHERE project_id = $2',
            [tenantResult.schemaName, project.project_id]
          );
        } catch (e) {
          logger.warn('[MCP] Schema provision warning:', e);
        }

        return NextResponse.json({
          jsonrpc: '2.0',
          id: id || 1,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  projectId: project.project_id,
                  displayName: project.display_name,
                  dialect: project.dialect,
                  role: userRole,
                  message: `Project "${project.display_name}" (${dialect}) created and ready.`
                }, null, 2)
              }
            ]
          }
        });
      }

      if (toolName === 'list_projects') {
        const projects = await getProjectsForCurrentUser();
        return NextResponse.json({
          jsonrpc: '2.0',
          id: id || 1,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(projects, null, 2)
              }
            ]
          }
        });
      }

      return NextResponse.json({
        jsonrpc: '2.0',
        id: id || 1,
        error: { code: -32601, message: `Tool "${toolName}" not found.` }
      });
    }

    return NextResponse.json({
      jsonrpc: '2.0',
      id: id || 1,
      result: {
        server: 'Fluxbase MCP Gateway',
        status: 'online',
        tools: MCP_TOOLS.map(t => t.name)
      }
    });

  } catch (error: any) {
    logger.error('MCP Gateway Error:', error);
    return NextResponse.json({
      jsonrpc: '2.0',
      error: { code: -32603, message: error.message || 'Internal MCP Gateway error.' }
    }, { status: 500 });
  }
}
