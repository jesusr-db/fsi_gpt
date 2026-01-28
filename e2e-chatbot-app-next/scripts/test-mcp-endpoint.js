#!/usr/bin/env node

/**
 * Test script to verify MCP endpoint connectivity
 * Run this to check if the you_mcp endpoint is accessible
 */

const https = require('https');

// Get configuration from environment or use defaults
const DATABRICKS_HOST = process.env.DATABRICKS_HOST || 'YOUR_DATABRICKS_HOST';
const DATABRICKS_TOKEN = process.env.DATABRICKS_TOKEN || 'YOUR_TOKEN';

if (DATABRICKS_HOST === 'YOUR_DATABRICKS_HOST' || DATABRICKS_TOKEN === 'YOUR_TOKEN') {
  console.error('Please set DATABRICKS_HOST and DATABRICKS_TOKEN environment variables');
  console.error('Example:');
  console.error('  export DATABRICKS_HOST=https://your-workspace.cloud.databricks.com');
  console.error('  export DATABRICKS_TOKEN=your-access-token');
  process.exit(1);
}

const mcpEndpoint = `${DATABRICKS_HOST}/api/2.0/mcp/external/you_mcp`;

console.log('Testing MCP endpoint:', mcpEndpoint);
console.log('---');

// Test 1: List tools
async function testListTools() {
  return new Promise((resolve, reject) => {
    const url = new URL(mcpEndpoint);

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DATABRICKS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Response Headers:', JSON.stringify(res.headers, null, 2));

        try {
          const parsed = JSON.parse(data);
          console.log('Response Body:', JSON.stringify(parsed, null, 2));

          if (res.statusCode === 200) {
            console.log('✅ MCP endpoint is accessible');

            if (parsed.tools && Array.isArray(parsed.tools)) {
              console.log(`✅ Found ${parsed.tools.length} tools:`);
              parsed.tools.forEach(tool => {
                console.log(`  - ${tool.name}: ${tool.description || 'No description'}`);
              });
            } else {
              console.log('⚠️  No tools array in response');
            }
          } else {
            console.log('❌ MCP endpoint returned non-200 status');
          }

          resolve(parsed);
        } catch (e) {
          console.log('Raw Response:', data);
          console.error('❌ Failed to parse response:', e.message);
          reject(e);
        }
      });
    });

    req.on('error', (e) => {
      console.error('❌ Request failed:', e.message);
      reject(e);
    });

    const requestBody = JSON.stringify({
      method: 'tools/list',
    });

    console.log('Request Body:', requestBody);
    req.write(requestBody);
    req.end();
  });
}

// Test 2: Try a simple web search (if tools are available)
async function testWebSearch() {
  return new Promise((resolve, reject) => {
    const url = new URL(mcpEndpoint);

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DATABRICKS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log('\n--- Web Search Test ---');
        console.log('Status:', res.statusCode);

        try {
          const parsed = JSON.parse(data);
          console.log('Response:', JSON.stringify(parsed, null, 2));

          if (res.statusCode === 200) {
            console.log('✅ Web search executed successfully');
          } else {
            console.log('❌ Web search failed');
          }

          resolve(parsed);
        } catch (e) {
          console.log('Raw Response:', data);
          console.error('❌ Failed to parse response:', e.message);
          reject(e);
        }
      });
    });

    req.on('error', (e) => {
      console.error('❌ Request failed:', e.message);
      reject(e);
    });

    const requestBody = JSON.stringify({
      method: 'tools/call',
      params: {
        name: 'web_search',
        arguments: {
          query: 'Databricks latest news',
          maxResults: 3,
        },
      },
    });

    console.log('Request Body:', requestBody);
    req.write(requestBody);
    req.end();
  });
}

// Run tests
async function runTests() {
  try {
    console.log('=== Testing MCP Endpoint ===\n');

    // Test listing tools
    console.log('Test 1: List available tools');
    console.log('---');
    const tools = await testListTools();

    // Only test web search if tools were found
    if (tools && tools.tools && tools.tools.length > 0) {
      console.log('\nTest 2: Execute web search');
      await testWebSearch();
    } else {
      console.log('\n⚠️  Skipping web search test - no tools available');
    }

    console.log('\n=== Tests Complete ===');
  } catch (error) {
    console.error('\n❌ Tests failed:', error.message);
    process.exit(1);
  }
}

runTests();