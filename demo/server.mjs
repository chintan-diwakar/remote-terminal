#!/usr/bin/env node

/**
 * Demo API Server
 * This is a demo application that simulates a config expiry error
 * Used for demonstrating remote-terminal capabilities
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, 'config.json');
const LOG_PATH = path.join(__dirname, 'logs', 'app.log');

// Ensure logs directory exists
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Logger
function log(level, message, details = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...details
  };

  const logLine = `[${timestamp}] ${level.toUpperCase()}: ${message}${Object.keys(details).length ? ' | ' + JSON.stringify(details) : ''}\n`;

  // Write to file
  fs.appendFileSync(LOG_PATH, logLine);

  // Also print to console with colors
  const colors = {
    info: '\x1b[36m',    // cyan
    warn: '\x1b[33m',    // yellow
    error: '\x1b[31m',   // red
    success: '\x1b[32m', // green
    reset: '\x1b[0m'
  };

  console.log(`${colors[level] || ''}[${timestamp}] ${level.toUpperCase()}: ${message}${colors.reset}`);
  if (Object.keys(details).length) {
    console.log(`  Details:`, details);
  }
}

// Check if a date has expired
function isExpired(dateString) {
  const expiryDate = new Date(dateString);
  const now = new Date();
  return now > expiryDate;
}

// Calculate days until/since expiry
function daysFromExpiry(dateString) {
  const expiryDate = new Date(dateString);
  const now = new Date();
  const diffTime = expiryDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

// Validate configuration
function validateConfig(config) {
  const errors = [];
  const warnings = [];

  log('info', 'Starting configuration validation...');

  // Check API token expiry
  if (config.api_token?.expires_at) {
    const days = daysFromExpiry(config.api_token.expires_at);
    if (isExpired(config.api_token.expires_at)) {
      errors.push({
        type: 'API_TOKEN_EXPIRED',
        message: `API token expired ${Math.abs(days)} days ago`,
        expires_at: config.api_token.expires_at,
        fix: 'Update api_token.expires_at in config.json to a future date'
      });
    } else if (days <= 7) {
      warnings.push({
        type: 'API_TOKEN_EXPIRING_SOON',
        message: `API token expires in ${days} days`,
        expires_at: config.api_token.expires_at
      });
    }
  }

  // Check SSL certificate expiry
  if (config.ssl_certificate?.expires_at) {
    const days = daysFromExpiry(config.ssl_certificate.expires_at);
    if (isExpired(config.ssl_certificate.expires_at)) {
      errors.push({
        type: 'SSL_CERTIFICATE_EXPIRED',
        message: `SSL certificate expired ${Math.abs(days)} days ago`,
        expires_at: config.ssl_certificate.expires_at,
        fix: 'Update ssl_certificate.expires_at in config.json or renew certificate'
      });
    } else if (days <= 14) {
      warnings.push({
        type: 'SSL_CERTIFICATE_EXPIRING_SOON',
        message: `SSL certificate expires in ${days} days`,
        expires_at: config.ssl_certificate.expires_at
      });
    }
  }

  // Check database config
  if (!config.database?.host) {
    errors.push({
      type: 'DATABASE_CONFIG_MISSING',
      message: 'Database host not configured',
      fix: 'Add database.host to config.json'
    });
  }

  return { errors, warnings };
}

// Simulate database connection
async function connectDatabase(config) {
  log('info', 'Connecting to database...', {
    host: config.database.host,
    port: config.database.port
  });

  // Simulate connection delay
  await new Promise(resolve => setTimeout(resolve, 500));

  log('success', 'Database connection established');
  return true;
}

// Simulate API health check
async function checkApiHealth() {
  log('info', 'Performing API health check...');
  await new Promise(resolve => setTimeout(resolve, 300));
  log('success', 'API health check passed');
  return true;
}

// Main startup function
async function startServer() {
  console.log('\n' + '='.repeat(60));
  console.log('  DEMO API SERVER');
  console.log('  Version 1.2.0');
  console.log('='.repeat(60) + '\n');

  log('info', 'Server starting...');
  log('info', `Loading configuration from ${CONFIG_PATH}`);

  // Load config
  let config;
  try {
    const configData = fs.readFileSync(CONFIG_PATH, 'utf8');
    config = JSON.parse(configData);
    log('success', 'Configuration loaded successfully');
  } catch (err) {
    log('error', 'Failed to load configuration', { error: err.message });
    process.exit(1);
  }

  // Validate config
  const { errors, warnings } = validateConfig(config);

  // Log warnings
  for (const warning of warnings) {
    log('warn', warning.message, { type: warning.type });
  }

  // If there are errors, fail startup
  if (errors.length > 0) {
    console.log('\n' + '!'.repeat(60));
    log('error', `Configuration validation failed with ${errors.length} error(s)`);

    for (const error of errors) {
      log('error', error.message, {
        type: error.type,
        expires_at: error.expires_at
      });
      console.log(`\n  FIX: ${error.fix}\n`);
    }

    console.log('!'.repeat(60) + '\n');
    log('error', 'Server startup aborted due to configuration errors');
    log('info', 'Check logs at: ' + LOG_PATH);

    process.exit(1);
  }

  // Continue with startup
  try {
    await connectDatabase(config);
    await checkApiHealth();

    const port = process.env.PORT || 3000;
    console.log('\n' + '='.repeat(60));
    log('success', `Server is running on port ${port}`);
    log('info', 'Press Ctrl+C to stop');
    console.log('='.repeat(60) + '\n');

    // Keep the process running
    setInterval(() => {
      log('info', 'Heartbeat - server is healthy');
    }, 30000);

  } catch (err) {
    log('error', 'Startup failed', { error: err.message });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n');
  log('info', 'Received SIGINT, shutting down gracefully...');
  log('info', 'Server stopped');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('info', 'Received SIGTERM, shutting down gracefully...');
  log('info', 'Server stopped');
  process.exit(0);
});

// Start the server
startServer();
