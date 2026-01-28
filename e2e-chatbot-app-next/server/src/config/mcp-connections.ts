/**
 * MCP Connection Configuration
 *
 * This file defines the available MCP connections that can be used by the AI model.
 * These connections integrate with Unity Catalog external connections and the built-in
 * system AI functions.
 *
 * To add new MCP servers:
 * 1. Configure the external connection in Unity Catalog
 * 2. Add the connection configuration here
 * 3. The tools will automatically be available to the AI model
 */

export interface McpConnection {
  /** Unique name for the connection (used in Unity Catalog) */
  name: string;
  /** Human-readable description */
  description: string;
  /** Whether this connection is enabled */
  enabled: boolean;
  /** Connection type */
  type: 'external' | 'system';
  /** Optional configuration for specific MCP servers */
  config?: Record<string, any>;
}

/**
 * Default MCP connections
 * These can be overridden via environment variables or database configuration
 */
export const DEFAULT_MCP_CONNECTIONS: McpConnection[] = [
  {
    name: 'you_mcp',
    description: 'Unity Catalog MCP server for web search, content fetching, and real-time information',
    enabled: process.env.MCP_ENABLED !== 'false',
    type: 'external',
    config: {
      maxResults: parseInt(process.env.MCP_MAX_RESULTS || '10'),
      timeout: parseInt(process.env.MCP_TIMEOUT || '30000'),
    },
  },
];

/**
 * Get enabled MCP connections
 */
export function getEnabledMcpConnections(): McpConnection[] {
  return DEFAULT_MCP_CONNECTIONS.filter(conn => conn.enabled);
}

/**
 * Check if MCP is enabled globally
 */
export function isMcpEnabled(): boolean {
  return process.env.MCP_ENABLED !== 'false' && getEnabledMcpConnections().length > 0;
}

/**
 * Get MCP connection by name
 */
export function getMcpConnection(name: string): McpConnection | undefined {
  return DEFAULT_MCP_CONNECTIONS.find(conn => conn.name === name);
}

/**
 * Log MCP configuration on startup
 */
export function logMcpConfiguration(): void {
  if (!isMcpEnabled()) {
    console.log('[MCP] MCP is disabled');
    return;
  }

  const enabled = getEnabledMcpConnections();
  console.log('[MCP] MCP is enabled with the following connections:');

  for (const conn of enabled) {
    console.log(`  - ${conn.name}: ${conn.description} (${conn.type})`);
  }

  const disabled = DEFAULT_MCP_CONNECTIONS.filter(conn => !conn.enabled);
  if (disabled.length > 0) {
    console.log('[MCP] Disabled connections:');
    for (const conn of disabled) {
      console.log(`  - ${conn.name}: ${conn.description}`);
    }
  }
}