import { z } from 'zod';
import type { Tool } from 'ai';
import { mcpClient } from './databricks-mcp-client';
import {
  getEnabledMcpConnections,
  isMcpEnabled,
  logMcpConfiguration,
  type McpConnection,
} from '../config/mcp-connections';

/**
 * MCP Tool Provider
 * Manages the integration of MCP tools with the Vercel AI SDK
 */
export class McpToolProvider {
  private static instance: McpToolProvider;
  private tools: Map<string, Tool> = new Map();
  private initialized = false;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): McpToolProvider {
    if (!McpToolProvider.instance) {
      McpToolProvider.instance = new McpToolProvider();
    }
    return McpToolProvider.instance;
  }

  /**
   * Initialize the MCP tool provider
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[MCP] Tool provider already initialized');
      return;
    }

    console.log('[MCP] Initializing MCP tool provider...');
    logMcpConfiguration();

    if (!isMcpEnabled()) {
      console.log('[MCP] MCP is disabled, skipping initialization');
      this.initialized = true;
      return;
    }

    try {
      const connections = getEnabledMcpConnections();

      // Initialize the MCP client with connections
      await mcpClient.initialize(
        connections.map(conn => ({
          connectionName: conn.name,
          description: conn.description,
          enabled: conn.enabled,
        }))
      );

      // Load all tools from enabled connections
      await this.loadTools(connections);

      this.initialized = true;
      console.log(`[MCP] Tool provider initialized with ${this.tools.size} tools`);
    } catch (error) {
      console.error('[MCP] Failed to initialize tool provider:', error);
      // Don't throw - allow the app to continue without MCP tools
      this.initialized = true;
    }
  }

  /**
   * Load tools from MCP connections
   */
  private async loadTools(connections: McpConnection[]): Promise<void> {
    this.tools.clear();

    for (const connection of connections) {
      try {
        console.log(`[MCP] Loading tools from ${connection.name}...`);

        // Load tools from MCP server
        const tools = await mcpClient.getAllTools([
          {
            connectionName: connection.name,
            description: connection.description,
            enabled: connection.enabled,
          },
        ]);

        for (const tool of tools) {
          this.tools.set(tool.name, tool);
          console.log(`[MCP] Loaded tool: ${tool.name}`);
        }

        // If no tools were loaded from the server, add default tools
        if (tools.length === 0 && connection.name === 'you_mcp') {
          console.log('[MCP] No tools loaded from server, adding default tools...');
          this.addDefaultTools();
        }
      } catch (error) {
        console.error(`[MCP] Failed to load tools from ${connection.name}:`, error);

        // If you_mcp fails, add default tools as fallback
        if (connection.name === 'you_mcp') {
          console.log('[MCP] Adding default tools as fallback...');
          this.addDefaultTools();
        }
      }
    }
  }

  /**
   * Add default tools when MCP server is not available
   */
  private addDefaultTools(): void {
    this.addWebSearchTool();
    this.addWebFetchTool();
  }

  /**
   * Add web search tool
   */
  private addWebSearchTool(): void {
    const tool: Tool = {
      name: 'web_search',
      description: 'Search the web for current information, news, and recent events',
      inputSchema: z.object({
        query: z.string().describe('The search query'),
        maxResults: z.number().optional().default(10).describe('Maximum number of results to return'),
      }),
      outputSchema: z.object({
        results: z.array(
          z.object({
            title: z.string(),
            url: z.string(),
            snippet: z.string(),
            publishedDate: z.string().optional(),
          })
        ),
      }),
      execute: async (args) => {
        console.log('[MCP] Executing web search:', args);
        try {
          const result = await mcpClient.callTool('you_mcp', 'web_search', args);
          return result;
        } catch (error) {
          console.error('[MCP] Web search failed:', error);
          return {
            results: [],
            error: error instanceof Error ? error.message : 'Search failed',
          };
        }
      },
    };

    this.tools.set('web_search', tool);
    console.log('[MCP] Added web_search tool');
  }

  /**
   * Add web fetch tool
   */
  private addWebFetchTool(): void {
    const tool: Tool = {
      name: 'web_fetch',
      description: 'Fetch and analyze content from a web page',
      inputSchema: z.object({
        url: z.string().url().describe('The URL to fetch'),
        extractText: z.boolean().optional().default(true).describe('Whether to extract text content'),
        summarize: z.boolean().optional().default(false).describe('Whether to summarize the content'),
      }),
      outputSchema: z.object({
        title: z.string().optional(),
        content: z.string(),
        url: z.string(),
        fetchedAt: z.string(),
      }),
      execute: async (args) => {
        console.log('[MCP] Executing web fetch:', args);
        try {
          const result = await mcpClient.callTool('you_mcp', 'web_fetch', args);
          return result;
        } catch (error) {
          console.error('[MCP] Web fetch failed:', error);
          return {
            content: '',
            url: args.url,
            fetchedAt: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Fetch failed',
          };
        }
      },
    };

    this.tools.set('web_fetch', tool);
    console.log('[MCP] Added web_fetch tool');
  }


  /**
   * Get all available tools for the AI model
   */
  getTools(): Record<string, Tool> {
    if (!this.initialized) {
      console.warn('[MCP] Tool provider not initialized, returning empty tools');
      return {};
    }

    const tools: Record<string, Tool> = {};
    for (const [name, tool] of this.tools.entries()) {
      tools[name] = tool;
    }

    return tools;
  }

  /**
   * Get a specific tool by name
   */
  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Refresh tools from MCP connections
   */
  async refresh(): Promise<void> {
    console.log('[MCP] Refreshing MCP tools...');
    mcpClient.clearCache();
    this.initialized = false;
    await this.initialize();
  }
}

// Export singleton instance
export const mcpToolProvider = McpToolProvider.getInstance();