#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const twilio = require('twilio');
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

// Initialize Twilio client
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
const defaultRecipient = process.env.DEFAULT_PHONE_NUMBER;

// Initialize Supabase client
let supabaseUrl = process.env.SUPABASE_URL?.trim();
let supabaseKey = process.env.SUPABASE_ANON_KEY?.trim();

// Extract URL from the environment variable (it might contain extra formatting)
if (supabaseUrl && supabaseUrl.includes('https://')) {
  const urlMatch = supabaseUrl.match(/https:\/\/[a-zA-Z0-9-]+\.supabase\.co/);
  if (urlMatch) {
    supabaseUrl = urlMatch[0];
  }
}

// Extract key from the environment variable 
if (supabaseKey && supabaseKey.includes('eyJ')) {
  const keyMatch = supabaseKey.match(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/);
  if (keyMatch) {
    supabaseKey = keyMatch[0];
  }
}

let supabase = null;

if (supabaseUrl && supabaseKey && supabaseUrl.startsWith('https://') && supabaseKey.startsWith('eyJ')) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✓ Supabase client initialized successfully');
  } catch (error) {
    console.log('⚠ Supabase client initialization failed:', error.message);
  }
} else {
  console.log('⚠ Supabase not configured - missing or invalid environment variables');
}

let twilioClient = null;

// Check if Twilio is configured
function isTwilioConfigured() {
  return accountSid && authToken && twilioPhoneNumber && defaultRecipient;
}

// Check if Supabase is configured
function isSupabaseConfigured() {
  return supabase !== null;
}

// Function to log message to Supabase
async function logMessageToSupabase(messageData) {
  if (!isSupabaseConfigured()) {
    console.log('Supabase not configured, skipping database logging');
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('sms_messages')
      .insert([messageData])
      .select();

    if (error) {
      console.error('Error logging to Supabase:', error);
      return null;
    }

    console.log('✓ Message logged to Supabase:', data[0]?.id);
    return data[0];
  } catch (error) {
    console.error('Supabase logging error:', error);
    return null;
  }
}

// Execute task_complete tool
async function executeTaskComplete(args) {
  console.log(`[${new Date().toISOString()}] Starting executeTaskComplete with args:`, JSON.stringify(args, null, 2));
  
  // Validate Twilio configuration
  if (!twilioClient) {
    console.error(`[${new Date().toISOString()}] Twilio client not configured`);
    throw new Error('Twilio client is not configured. Check environment variables.');
  }

  // Extract and validate arguments
  const { message, to_phone_number } = args;
  console.log(`[${new Date().toISOString()}] Processing message: "${message}" to: ${to_phone_number || 'default number'}`);

  if (!message) {
    throw new Error('Message is required');
  }

  // Use default recipient if no phone number provided
  const recipient = to_phone_number || defaultRecipient;

  // Validate phone number format
  if (!recipient.startsWith('+')) {
    throw new Error('Phone number must be in E.164 format (start with +)');
  }

  // Truncate message if it exceeds 250 characters
  const originalLength = message.length;
  let finalMessage = message;
  
  if (originalLength > 250) {
    finalMessage = message.substring(0, 247) + '...';
    console.log(`Message truncated from ${originalLength} to 250 characters`);
  }

  // Send SMS via Twilio
  console.log(`[${new Date().toISOString()}] Sending SMS via Twilio...`);
  const twilioMessage = await twilioClient.messages.create({
    body: finalMessage,
    from: twilioPhoneNumber,
    to: recipient
  });

  console.log(`[${new Date().toISOString()}] SMS sent successfully with SID: ${twilioMessage.sid}`);

  const result = {
    success: true,
    message_sid: twilioMessage.sid,
    truncated: originalLength > 250,
    original_length: originalLength,
    sent_length: finalMessage.length,
    recipient: recipient
  };

  // Log to Supabase database
  console.log(`[${new Date().toISOString()}] Logging to Supabase...`);
  const messageData = {
    message_sid: twilioMessage.sid,
    from_phone: twilioPhoneNumber,
    to_phone: recipient,
    original_message: message,
    sent_message: finalMessage,
    original_length: originalLength,
    sent_length: finalMessage.length,
    truncated: originalLength > 250,
    status: 'sent',
    sent_at: new Date().toISOString(),
    twilio_status: twilioMessage.status
  };

  await logMessageToSupabase(messageData);

  console.log(`✓ SMS sent successfully: ${twilioMessage.sid}`);
  return result;
}

// Initialize Twilio client if configured
if (isTwilioConfigured()) {
  twilioClient = twilio(accountSid, authToken);
  console.log('✓ Twilio client initialized successfully');
} else {
  console.log('⚠ Twilio client not configured - missing environment variables');
}

// Create MCP server
const server = new Server(
  {
    name: 'twilio-sms-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define the task_complete tool
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'task_complete',
        description: 'Send SMS message via Twilio when a task is completed',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'The message to send via SMS'
            },
            to_phone_number: {
              type: 'string',
              description: 'The recipient phone number (E.164 format). If not provided, uses configured default number'
            }
          },
          required: ['message']
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name !== 'task_complete') {
    throw new Error(`Unknown tool: ${name}`);
  }

  // Validate Twilio configuration
  if (!twilioClient) {
    throw new Error('Twilio client is not configured. Check environment variables.');
  }

  // Extract and validate arguments
  const { message, to_phone_number } = args;

  if (!message) {
    throw new Error('Message is required');
  }

  // Use default recipient if no phone number provided
  const recipient = to_phone_number || defaultRecipient;

  // Validate phone number format
  if (!recipient.startsWith('+')) {
    throw new Error('Phone number must be in E.164 format (start with +)');
  }

  // Truncate message if it exceeds 250 characters
  const originalLength = message.length;
  let finalMessage = message;
  
  if (originalLength > 250) {
    finalMessage = message.substring(0, 247) + '...';
    console.log(`Message truncated from ${originalLength} to 250 characters`);
  }

  try {
    // Send SMS via Twilio
    const twilioMessage = await twilioClient.messages.create({
      body: finalMessage,
      from: twilioPhoneNumber,
      to: recipient
    });

    const result = {
      success: true,
      message_sid: twilioMessage.sid,
      truncated: originalLength > 250,
      original_length: originalLength,
      sent_length: finalMessage.length,
      recipient: recipient
    };

    // Log to Supabase database
    const messageData = {
      message_sid: twilioMessage.sid,
      from_phone: twilioPhoneNumber,
      to_phone: recipient,
      original_message: message,
      sent_message: finalMessage,
      original_length: originalLength,
      sent_length: finalMessage.length,
      truncated: originalLength > 250,
      status: 'sent',
      sent_at: new Date().toISOString(),
      twilio_status: twilioMessage.status
    };

    await logMessageToSupabase(messageData);

    console.log(`✓ SMS sent successfully: ${twilioMessage.sid}`);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };

  } catch (error) {
    console.log(`✗ Failed to send SMS: ${error.message}`);
    throw new Error(`Failed to send SMS: ${error.message}`);
  }
});

// Create Express app
const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    server: 'twilio-mcp-server',
    configured: isTwilioConfigured()
  });
});

// MCP endpoint with SSE transport (GET)
app.get('/mcp', async (req, res) => {
  try {
    const transport = new SSEServerTransport('/mcp', res);
    await server.connect(transport);
  } catch (error) {
    console.error('SSE connection error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to establish SSE connection' });
    }
  }
});

// MCP endpoint for direct JSON-RPC requests (POST)
app.post('/mcp', async (req, res) => {
  const startTime = Date.now();
  try {
    const request = req.body;
    console.log(`[${new Date().toISOString()}] Received MCP request:`, JSON.stringify(request, null, 2));
    
    // Handle initialize request directly
    if (request.method === 'initialize') {
      const response = {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: "twilio-sms-mcp-server",
            version: "1.0.0"
          }
        }
      };
      console.log(`[${new Date().toISOString()}] Sending initialize response (${Date.now() - startTime}ms):`, JSON.stringify(response, null, 2));
      return res.json(response);
    }
    
    // Handle notifications/initialized request
    if (request.method === 'notifications/initialized') {
      console.log(`[${new Date().toISOString()}] Received notifications/initialized - acknowledging (${Date.now() - startTime}ms)`);
      return res.status(200).send(); // No response body needed for notifications
    }
    
    // Handle tools/list request
    if (request.method === 'tools/list') {
      const response = {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          tools: [
            {
              name: 'task_complete',
              description: 'Send SMS message via Twilio when a task is completed',
              inputSchema: {
                type: 'object',
                properties: {
                  message: {
                    type: 'string',
                    description: 'The message to send via SMS'
                  },
                  to_phone_number: {
                    type: 'string',
                    description: 'The recipient phone number (E.164 format). If not provided, uses configured default number'
                  }
                },
                required: ['message']
              }
            }
          ]
        }
      };
      console.log(`[${new Date().toISOString()}] Sending tools list response (${Date.now() - startTime}ms):`, JSON.stringify(response, null, 2));
      return res.json(response);
    }
    
    // Handle tools/call request
    if (request.method === 'tools/call') {
      console.log(`[${new Date().toISOString()}] Processing tools/call request (${Date.now() - startTime}ms)`);
      console.log('Tool call params:', JSON.stringify(request.params, null, 2));
      const { name, arguments: args } = request.params;
      
      if (name !== 'task_complete') {
        throw new Error(`Unknown tool: ${name}`);
      }
      
      // Execute the SMS sending logic
      const result = await executeTaskComplete(args);
      
      const response = {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        }
      };
      
      console.log(`[${new Date().toISOString()}] Sending tool call response (${Date.now() - startTime}ms):`, JSON.stringify(response, null, 2));
      return res.json(response);
    }
    
    // Unknown method
    console.log(`[${new Date().toISOString()}] Unknown method: ${request.method} (${Date.now() - startTime}ms)`);
    res.status(400).json({
      jsonrpc: "2.0",
      id: request.id || null,
      error: {
        code: -32601,
        message: "Method not found"
      }
    });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] MCP request error (${Date.now() - startTime}ms):`, error);
    res.status(500).json({
      jsonrpc: "2.0",
      id: req.body?.id || null,
      error: {
        code: -32603,
        message: "Internal error",
        data: error.message
      }
    });
  }
});

// Start HTTP server
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Twilio MCP Server running on http://0.0.0.0:${PORT}`);
  console.log(`📡 MCP endpoint: http://0.0.0.0:${PORT}/mcp`);
  console.log(`💚 Health check: http://0.0.0.0:${PORT}/health`);
});