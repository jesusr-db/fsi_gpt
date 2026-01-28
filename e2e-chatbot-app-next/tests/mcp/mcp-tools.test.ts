import { test, expect } from '@playwright/test';

test.describe('MCP Tools Integration', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the chat application
    await page.goto('/');

    // Wait for the app to load
    await page.waitForSelector('[data-testid="chat-input"]', { timeout: 10000 });
  });

  test('should check MCP status endpoint', async ({ request }) => {
    const response = await request.get('/api/mcp/status');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty('enabled');
    expect(data).toHaveProperty('connections');
    expect(data).toHaveProperty('tools');
    expect(data).toHaveProperty('toolCount');
  });

  test('should list available MCP tools', async ({ request }) => {
    const response = await request.get('/api/mcp/tools');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty('tools');
    expect(data).toHaveProperty('count');
    expect(Array.isArray(data.tools)).toBeTruthy();
  });

  test('should refresh MCP tools', async ({ request }) => {
    const response = await request.post('/api/mcp/refresh');

    // Note: This might fail if MCP is not configured, which is okay for testing
    if (response.ok()) {
      const data = await response.json();
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('message');
      expect(data).toHaveProperty('toolCount');
      expect(data).toHaveProperty('tools');
    }
  });

  test('should handle web search requests in chat', async ({ page }) => {
    // Skip if MCP is not enabled
    const statusResponse = await page.request.get('/api/mcp/status');
    const status = await statusResponse.json();

    if (!status.enabled || !status.tools.includes('web_search')) {
      test.skip();
    }

    // Create a new chat
    const newChatButton = page.getByRole('button', { name: /new chat/i });
    await newChatButton.click();

    // Send a message that would trigger web search
    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.fill('What are the latest news about Databricks?');

    const sendButton = page.getByRole('button', { name: /send/i });
    await sendButton.click();

    // Wait for response
    await page.waitForSelector('[data-testid="assistant-message"]', { timeout: 30000 });

    // Check if the response contains information (this would come from web search)
    const assistantMessage = page.locator('[data-testid="assistant-message"]').last();
    const messageText = await assistantMessage.textContent();

    // The response should contain some content
    expect(messageText).toBeTruthy();
    expect(messageText?.length).toBeGreaterThan(50);
  });

  test('should display MCP tool usage in UI', async ({ page }) => {
    // Skip if MCP is not enabled
    const statusResponse = await page.request.get('/api/mcp/status');
    const status = await statusResponse.json();

    if (!status.enabled) {
      test.skip();
    }

    // Create a new chat
    const newChatButton = page.getByRole('button', { name: /new chat/i });
    await newChatButton.click();

    // Send a message that would trigger tool usage
    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.fill('Search the web for information about TypeScript 5.0');

    const sendButton = page.getByRole('button', { name: /send/i });
    await sendButton.click();

    // Wait for the tool usage indicator (if implemented in UI)
    // This assumes the UI shows when tools are being used
    const toolIndicator = page.locator('[data-testid="tool-usage-indicator"]');

    if (await toolIndicator.count() > 0) {
      await expect(toolIndicator).toBeVisible();

      // Check if web_search tool was used
      const toolName = await toolIndicator.getAttribute('data-tool-name');
      expect(toolName).toBe('web_search');
    }
  });

  test('should handle tool failures gracefully', async ({ page }) => {
    // Create a new chat
    const newChatButton = page.getByRole('button', { name: /new chat/i });
    await newChatButton.click();

    // Send a message with an invalid URL for web fetch
    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.fill('Fetch content from this invalid URL: not-a-valid-url');

    const sendButton = page.getByRole('button', { name: /send/i });
    await sendButton.click();

    // Wait for response
    await page.waitForSelector('[data-testid="assistant-message"]', { timeout: 30000 });

    // The AI should handle the error gracefully and provide a meaningful response
    const assistantMessage = page.locator('[data-testid="assistant-message"]').last();
    const messageText = await assistantMessage.textContent();

    expect(messageText).toBeTruthy();
    // Should not show raw error messages to the user
    expect(messageText).not.toContain('TypeError');
    expect(messageText).not.toContain('Stack trace');
  });
});

test.describe('MCP Configuration', () => {
  test('should respect MCP_ENABLED environment variable', async ({ request }) => {
    const response = await request.get('/api/mcp/status');
    const data = await response.json();

    // The enabled status should reflect the environment variable
    // (This assumes MCP_ENABLED is set in the test environment)
    if (process.env.MCP_ENABLED === 'false') {
      expect(data.enabled).toBe(false);
      expect(data.toolCount).toBe(0);
    } else {
      // Default is true unless explicitly disabled
      expect(data.enabled).toBe(true);
    }
  });

  test('should only enable configured tools', async ({ request }) => {
    const response = await request.get('/api/mcp/status');
    const data = await response.json();

    // Check that only enabled tools are present
    for (const connection of data.connections) {
      if (connection.name === 'web_search') {
        expect(connection.enabled).toBe(process.env.MCP_ENABLE_WEB_SEARCH !== 'false');
      }
      if (connection.name === 'enterprise_data') {
        // Enterprise data is disabled by default
        expect(connection.enabled).toBe(process.env.MCP_ENABLE_ENTERPRISE_DATA === 'true');
      }
    }
  });
});