# MCP (Model Context Protocol) Tools Documentation

## Overview

The MCP Tools feature enables the AI model to access external tools and services through Unity Catalog connections. This significantly extends the AI's capabilities beyond its base language model functions, allowing it to:

- **Search the web** for current information and recent events
- **Fetch and analyze web content** from specific URLs
- **Access Databricks documentation** and knowledge base
- **Query enterprise data** through Unity Catalog (when configured)
- **Use custom MCP servers** for specialized capabilities

## Architecture

```
┌─────────────────────────────────────────┐
│           Chat Application              │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │         Chat Route                │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │   Vercel AI SDK Tools       │  │  │
│  │  │  ┌──────────────────────┐   │  │  │
│  │  │  │  Databricks Tool     │   │  │  │
│  │  │  └──────────────────────┘   │  │  │
│  │  │  ┌──────────────────────┐   │  │  │
│  │  │  │    MCP Tools         │   │  │  │
│  │  │  └──────────────────────┘   │  │  │
│  │  └─────────────────────────────┘  │  │
│  └───────────────────────────────────┘  │
│                    │                    │
│  ┌─────────────────▼─────────────────┐  │
│  │     MCP Tool Provider             │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │  Tool Conversion Layer      │  │  │
│  │  │  (JSON Schema → Zod)        │  │  │
│  │  └─────────────────────────────┘  │  │
│  └───────────────────────────────────┘  │
│                    │                    │
│  ┌─────────────────▼─────────────────┐  │
│  │   Databricks MCP Client           │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │   Unity Catalog API         │  │  │
│  │  └─────────────────────────────┘  │  │
│  └───────────────────────────────────┘  │
└─────────────────┬───────────────────────┘
                  │
    ┌─────────────▼─────────────────┐
    │     Unity Catalog             │
    │  ┌───────────────────────┐    │
    │  │  External Connections │    │
    │  │  - web_search         │    │
    │  │  - web_fetch          │    │
    │  │  - databricks_docs    │    │
    │  │  - enterprise_data    │    │
    │  └───────────────────────┘    │
    │  ┌───────────────────────┐    │
    │  │  System AI Functions  │    │
    │  └───────────────────────┘    │
    └───────────────────────────────┘
```

## Configuration

### Environment Variables

Add these variables to your `.env` file to configure MCP:

```bash
# Enable/disable MCP globally (default: true)
# This enables the Unity Catalog MCP integration at /api/2.0/mcp/external/you_mcp
MCP_ENABLED=true

# MCP Configuration
MCP_MAX_RESULTS=10      # Maximum results for search operations
MCP_TIMEOUT=30000       # Timeout in milliseconds for MCP operations
```

### Unity Catalog Configuration

The MCP integration uses the Unity Catalog MCP endpoint at `/api/2.0/mcp/external/you_mcp`.

This endpoint provides:
- Web search capabilities
- Web content fetching
- Real-time information access
- Tool discovery and execution

The endpoint is automatically configured when MCP is enabled. The app will:

1. **Discover available tools** from the MCP server on startup
2. **Fallback to default tools** if the server is unavailable
3. **Cache tools** for 5 minutes to improve performance
4. **Handle failures gracefully** without disrupting chat functionality

## Available Tools

### 1. Web Search (`web_search`)

Search the web for current information, news, and recent events.

**Input Parameters:**
- `query` (string): The search query
- `maxResults` (number, optional): Maximum number of results (default: 10)

**Output:**
- `results`: Array of search results with title, URL, snippet, and published date

**Example Usage:**
```
User: "What are the latest developments in generative AI?"
AI: [Uses web_search tool to find recent news and information]
```

### 2. Web Fetch (`web_fetch`)

Fetch and analyze content from a specific web page.

**Input Parameters:**
- `url` (string): The URL to fetch
- `extractText` (boolean, optional): Whether to extract text content (default: true)
- `summarize` (boolean, optional): Whether to summarize the content (default: false)

**Output:**
- `title`: Page title
- `content`: Extracted content
- `url`: The fetched URL
- `fetchedAt`: Timestamp of when the content was fetched

**Example Usage:**
```
User: "Can you analyze this blog post: https://example.com/blog/ai-trends"
AI: [Uses web_fetch tool to retrieve and analyze the content]
```

### 3. Databricks Documentation (`databricks_docs`)

Search and retrieve Databricks documentation and knowledge base articles.

**Input Parameters:**
- `query` (string): The documentation search query
- `category` (enum, optional): Documentation category (general, ml, data-engineering, sql, governance, api)

**Output:**
- `articles`: Array of documentation articles with title, URL, excerpt, and category

**Example Usage:**
```
User: "How do I create a Unity Catalog table?"
AI: [Uses databricks_docs tool to find relevant documentation]
```

### 4. Enterprise Data (`enterprise_data`)

Access enterprise data through Unity Catalog (requires additional configuration).

**Input Parameters:**
- Varies based on your Unity Catalog configuration

**Output:**
- Query results from your enterprise data sources

**Note:** This tool is disabled by default and requires proper Unity Catalog setup.

## API Endpoints

The application provides several API endpoints for MCP management:

### GET /api/mcp/status

Get the current MCP status and available tools.

**Response:**
```json
{
  "enabled": true,
  "connections": [
    {
      "name": "web_search",
      "description": "Web search and news retrieval capabilities",
      "type": "external",
      "enabled": true
    }
  ],
  "tools": ["web_search", "web_fetch", "databricks_docs"],
  "toolCount": 3
}
```

### GET /api/mcp/tools

Get detailed information about available tools.

**Response:**
```json
{
  "tools": [
    {
      "name": "web_search",
      "description": "Search the web for current information",
      "hasInputSchema": true,
      "hasOutputSchema": true
    }
  ],
  "count": 3
}
```

### POST /api/mcp/refresh

Refresh MCP tools from Unity Catalog.

**Response:**
```json
{
  "success": true,
  "message": "MCP tools refreshed successfully",
  "toolCount": 3,
  "tools": ["web_search", "web_fetch", "databricks_docs"]
}
```

## Troubleshooting

### MCP Tools Not Available

If MCP tools are not showing up:

1. **Check environment variables**: Ensure `MCP_ENABLED=true` and individual tools are enabled
2. **Verify Unity Catalog connections**: Check that external connections are properly configured
3. **Check permissions**: Ensure the app's service principal has access to the connections
4. **Review logs**: Check server logs for MCP initialization errors

### Tool Execution Failures

If tools fail to execute:

1. **Check network connectivity**: Ensure the app can reach Unity Catalog endpoints
2. **Verify authentication**: Check that Databricks authentication is working
3. **Review rate limits**: Some MCP servers may have rate limiting
4. **Check tool parameters**: Ensure correct parameters are being passed

### Performance Issues

If MCP tools are slow:

1. **Enable caching**: Tools are cached for 5 minutes by default
2. **Optimize queries**: Use specific search terms and limit result counts
3. **Monitor Unity Catalog**: Check for any performance issues in Unity Catalog

## Security Considerations

1. **Authentication**: All MCP calls use Databricks authentication
2. **Authorization**: Tools respect Unity Catalog permissions
3. **Data Privacy**: Enterprise data access requires explicit configuration
4. **Rate Limiting**: Built-in rate limiting to prevent abuse
5. **Input Validation**: All tool inputs are validated using Zod schemas

## Development and Testing

### Local Development

For local development without Unity Catalog:

1. Set `MCP_ENABLED=false` to disable MCP
2. Or create mock MCP servers for testing
3. Use environment variables to control which tools are available

### Testing MCP Tools

```javascript
// Example test for MCP tools
describe('MCP Tools', () => {
  it('should list available tools', async () => {
    const response = await fetch('/api/mcp/status');
    const data = await response.json();

    expect(data.enabled).toBe(true);
    expect(data.tools).toContain('web_search');
  });

  it('should execute web search', async () => {
    // Test implementation
  });
});
```

## Best Practices

1. **Enable only needed tools**: Don't enable all tools if not required
2. **Configure appropriate timeouts**: Set reasonable timeouts for web fetch operations
3. **Monitor usage**: Track which tools are being used most frequently
4. **Cache results**: Leverage built-in caching to reduce API calls
5. **Handle failures gracefully**: Tools may fail; ensure the AI can continue without them

## Future Enhancements

- **Custom MCP Servers**: Support for adding custom MCP servers
- **Tool Chaining**: Allow tools to call other tools
- **Streaming Responses**: Support for streaming tool responses
- **Tool Permissions**: Fine-grained permissions per user/project
- **Usage Analytics**: Detailed analytics on tool usage

## Support

For issues or questions about MCP tools:

1. Check this documentation
2. Review server logs for detailed error messages
3. Contact your Databricks administrator for Unity Catalog issues
4. Open an issue in the project repository

---

*Last Updated: January 2024*
*Version: 1.0.0*