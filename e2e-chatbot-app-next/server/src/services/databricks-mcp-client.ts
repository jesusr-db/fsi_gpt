import { z } from 'zod';
import type { Tool } from 'ai';
import { getDatabricksToken } from '@chat-template/auth';
import { getHostUrl } from '@chat-template/utils';

/**
 * MCP Tool Schema - represents a tool from an MCP server
 */
const mcpToolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  inputSchema: z.record(z.any()).optional(),
});

type McpTool = z.infer<typeof mcpToolSchema>;

/**
 * MCP Server Response Schema
 */
const mcpServerResponseSchema = z.object({
  tools: z.array(mcpToolSchema).optional(),
  error: z.string().optional(),
});

/**
 * MCP Tool Call Request Schema
 */
const mcpToolCallRequestSchema = z.object({
  tool: z.string(),
  arguments: z.record(z.any()).optional(),
});

/**
 * MCP Tool Call Response Schema
 */
const mcpToolCallResponseSchema = z.object({
  result: z.any(),
  error: z.string().optional(),
});

/**
 * Configuration for MCP connections
 */
interface McpConnectionConfig {
  /** Name of the MCP connection in Unity Catalog */
  connectionName: string;
  /** Optional description for the connection */
  description?: string;
  /** Whether this connection is enabled */
  enabled?: boolean;
}

/**
 * MCP Client for Databricks
 * Handles connections to MCP servers through Unity Catalog
 */
export class DatabricksMCPClient {
  private static instance: DatabricksMCPClient;
  private cachedTools: Map<string, McpTool[]> = new Map();
  private toolCacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): DatabricksMCPClient {
    if (!DatabricksMCPClient.instance) {
      DatabricksMCPClient.instance = new DatabricksMCPClient();
    }
    return DatabricksMCPClient.instance;
  }

  /**
   * Get authentication headers for Databricks API calls
   */
  private async getAuthHeaders(): Promise<Headers> {
    const token = await getDatabricksToken();
    const headers = new Headers();
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('Content-Type', 'application/json');
    return headers;
  }

  /**
   * Get the base URL for MCP endpoints
   */
  private getBaseUrl(): string {
    const host = getHostUrl();
    return `${host}/api/2.0/mcp`;
  }

  /**
   * Initialize MCP connections
   * This would typically be called on server startup
   */
  async initialize(connections: McpConnectionConfig[]): Promise<void> {
    console.log('[MCP] Initializing MCP connections:', connections.map(c => c.connectionName));

    // Pre-fetch tools for enabled connections
    for (const connection of connections) {
      if (connection.enabled !== false) {
        try {
          await this.listTools(connection.connectionName);
        } catch (error) {
          console.error(`[MCP] Failed to initialize connection ${connection.connectionName}:`, error);
        }
      }
    }
  }

  /**
   * List available tools from an MCP server
   */
  async listTools(connectionName: string): Promise<McpTool[]> {
    // Check cache first
    const cached = this.cachedTools.get(connectionName);
    const expiry = this.toolCacheExpiry.get(connectionName);

    if (cached && expiry && Date.now() < expiry) {
      console.log(`[MCP] Using cached tools for ${connectionName}`);
      return cached;
    }

    console.log(`[MCP] Fetching tools from ${connectionName}`);

    try {
      const headers = await this.getAuthHeaders();
      const baseUrl = this.getBaseUrl();

      // For you_mcp, use the correct endpoint
      const toolsUrl = `${baseUrl}/external/${connectionName}`;
      console.log(`[MCP] Fetching tools from: ${toolsUrl}`);

      const response = await fetch(toolsUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          method: 'tools/list',
        }),
      });

      if (!response.ok) {
        console.log(`[MCP] Failed to fetch tools, status: ${response.status}`);
        console.log(`[MCP] Response: ${await response.text()}`);

        // Return empty tools array instead of throwing
        console.log('[MCP] Returning empty tools array as fallback');
        return [];
      }

      const data = await response.json();
      console.log('[MCP] Tools response:', JSON.stringify(data, null, 2));

      // Handle different response formats
      let tools: McpTool[] = [];
      if (data.tools) {
        tools = data.tools;
      } else if (Array.isArray(data)) {
        tools = data;
      }

      this.cacheTools(connectionName, tools);
      return tools;
    } catch (error) {
      console.error(`[MCP] Failed to list tools from ${connectionName}:`, error);
      // Return empty array instead of throwing to allow fallback tools
      return [];
    }
  }

  /**
   * Cache tools for a connection
   */
  private cacheTools(connectionName: string, tools: McpTool[]): void {
    this.cachedTools.set(connectionName, tools);
    this.toolCacheExpiry.set(connectionName, Date.now() + this.CACHE_DURATION);
    console.log(`[MCP] Cached ${tools.length} tools for ${connectionName}`);
  }

  /**
   * Call a tool on an MCP server
   */
  async callTool(
    connectionName: string,
    toolName: string,
    args?: Record<string, any>
  ): Promise<any> {
    console.log(`[MCP] Calling tool ${toolName} on ${connectionName}`, args);

    try {
      const headers = await this.getAuthHeaders();
      const baseUrl = this.getBaseUrl();

      // For you_mcp, use the correct request format
      const requestBody = {
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args || {},
        },
      };

      const callUrl = `${baseUrl}/external/${connectionName}`;
      console.log(`[MCP] Calling tool at: ${callUrl}`);
      console.log(`[MCP] Request body:`, JSON.stringify(requestBody, null, 2));

      const response = await fetch(callUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[MCP] Tool call failed, status: ${response.status}`);
        console.error(`[MCP] Error response: ${errorText}`);
        throw new Error(`Tool call failed: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`[MCP] Tool response:`, JSON.stringify(data, null, 2));

      // Handle different response formats
      if (data.result !== undefined) {
        return data.result;
      } else if (data.content) {
        return data.content;
      } else {
        return data;
      }
    } catch (error) {
      console.error(`[MCP] Tool call failed for ${toolName}:`, error);
      throw error;
    }
  }

  /**
   * Convert MCP tool to Vercel AI SDK tool format
   */
  convertToAiSdkTool(mcpTool: McpTool, connectionName: string): Tool {
    // Convert JSON Schema to Zod schema
    const inputSchema = this.jsonSchemaToZod(mcpTool.inputSchema || {});

    return {
      name: `${connectionName}_${mcpTool.name}`.replace(/[^a-zA-Z0-9_]/g, '_'),
      description: mcpTool.description || `MCP tool: ${mcpTool.name}`,
      inputSchema,
      outputSchema: z.any(), // MCP tools can return any format
      execute: async (args: any) => {
        return this.callTool(connectionName, mcpTool.name, args);
      },
    };
  }

  /**
   * Convert JSON Schema to Zod schema (simplified version)
   * In production, you might want to use a more comprehensive converter
   */
  private jsonSchemaToZod(jsonSchema: any): z.ZodType<any> {
    if (!jsonSchema || Object.keys(jsonSchema).length === 0) {
      return z.object({}).passthrough(); // Allow any properties
    }

    // Handle basic JSON Schema types
    if (jsonSchema.type === 'object' && jsonSchema.properties) {
      const shape: Record<string, z.ZodType<any>> = {};

      for (const [key, value] of Object.entries(jsonSchema.properties)) {
        shape[key] = this.convertJsonSchemaProperty(value as any);
      }

      const required = jsonSchema.required || [];
      const objectSchema = z.object(shape);

      // Make non-required fields optional
      for (const key of Object.keys(shape)) {
        if (!required.includes(key)) {
          shape[key] = shape[key].optional();
        }
      }

      return z.object(shape);
    }

    // Default to any for complex schemas
    return z.any();
  }

  /**
   * Convert a single JSON Schema property to Zod
   */
  private convertJsonSchemaProperty(prop: any): z.ZodType<any> {
    if (!prop || !prop.type) {
      return z.any();
    }

    switch (prop.type) {
      case 'string':
        return z.string();
      case 'number':
        return z.number();
      case 'integer':
        return z.number().int();
      case 'boolean':
        return z.boolean();
      case 'array':
        return z.array(prop.items ? this.convertJsonSchemaProperty(prop.items) : z.any());
      case 'object':
        return this.jsonSchemaToZod(prop);
      default:
        return z.any();
    }
  }

  /**
   * Get all available tools from all configured connections
   */
  async getAllTools(connections: McpConnectionConfig[]): Promise<Tool[]> {
    const allTools: Tool[] = [];

    for (const connection of connections) {
      if (connection.enabled !== false) {
        try {
          const mcpTools = await this.listTools(connection.connectionName);
          for (const mcpTool of mcpTools) {
            allTools.push(this.convertToAiSdkTool(mcpTool, connection.connectionName));
          }
        } catch (error) {
          console.error(`[MCP] Failed to get tools from ${connection.connectionName}:`, error);
        }
      }
    }

    console.log(`[MCP] Total tools available: ${allTools.length}`);
    return allTools;
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.cachedTools.clear();
    this.toolCacheExpiry.clear();
    console.log('[MCP] Cache cleared');
  }
}

// Export singleton instance
export const mcpClient = DatabricksMCPClient.getInstance();