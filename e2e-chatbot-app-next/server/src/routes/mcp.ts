import { Router, type Request, type Response, type Router as RouterType } from 'express';
import { authMiddleware, requireAuth } from '../middleware/auth';
import { mcpToolProvider } from '../services/mcp-tool-provider';
import { isMcpEnabled, getEnabledMcpConnections } from '../config/mcp-connections';

export const mcpRouter: RouterType = Router();

// Apply auth middleware to all MCP routes
mcpRouter.use(authMiddleware);

/**
 * GET /api/mcp/status - Get MCP status and available tools
 */
mcpRouter.get('/status', requireAuth, async (_req: Request, res: Response) => {
  try {
    const enabled = isMcpEnabled();
    const connections = getEnabledMcpConnections();
    const toolNames = mcpToolProvider.getToolNames();

    const status = {
      enabled,
      connections: connections.map(conn => ({
        name: conn.name,
        description: conn.description,
        type: conn.type,
        enabled: conn.enabled,
      })),
      tools: toolNames,
      toolCount: toolNames.length,
    };

    res.json(status);
  } catch (error) {
    console.error('[MCP] Failed to get status:', error);
    res.status(500).json({
      error: 'Failed to get MCP status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/mcp/tools - Get detailed information about available tools
 */
mcpRouter.get('/tools', requireAuth, async (_req: Request, res: Response) => {
  try {
    const tools = mcpToolProvider.getTools();
    const toolDetails = Object.entries(tools).map(([name, tool]) => ({
      name,
      description: tool.description,
      // Don't expose full schema to frontend for security
      hasInputSchema: !!tool.inputSchema,
      hasOutputSchema: !!tool.outputSchema,
    }));

    res.json({
      tools: toolDetails,
      count: toolDetails.length,
    });
  } catch (error) {
    console.error('[MCP] Failed to get tools:', error);
    res.status(500).json({
      error: 'Failed to get MCP tools',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/mcp/refresh - Refresh MCP tools from Unity Catalog
 */
mcpRouter.post('/refresh', requireAuth, async (_req: Request, res: Response) => {
  try {
    console.log('[MCP] Refreshing tools...');
    await mcpToolProvider.refresh();

    const toolNames = mcpToolProvider.getToolNames();
    res.json({
      success: true,
      message: 'MCP tools refreshed successfully',
      toolCount: toolNames.length,
      tools: toolNames,
    });
  } catch (error) {
    console.error('[MCP] Failed to refresh tools:', error);
    res.status(500).json({
      error: 'Failed to refresh MCP tools',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});