#!/bin/bash

# Demo Setup Script for remote-terminal
# This script sets up various demo scenarios

set -e

DEMO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$DEMO_DIR/config.json"
LOG_DIR="$DEMO_DIR/logs"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║           remote-terminal Demo Setup Script                ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Create logs directory
mkdir -p "$LOG_DIR"

show_menu() {
    echo ""
    echo -e "${YELLOW}Select a demo scenario:${NC}"
    echo ""
    echo "  1) Setup BROKEN state (expired config) - for demo start"
    echo "  2) Setup WORKING state (valid config) - for demo end"
    echo "  3) Run server (will fail if config expired)"
    echo "  4) Show current config status"
    echo "  5) View recent logs"
    echo "  6) Clear logs"
    echo "  7) Exit"
    echo ""
    read -p "Enter choice [1-7]: " choice
}

# Set config to expired state (BROKEN)
set_broken_state() {
    echo -e "${RED}Setting up BROKEN state (expired config)...${NC}"

    # Set dates to past (expired)
    cat > "$CONFIG_FILE" << 'EOF'
{
  "app_name": "demo-api",
  "version": "1.2.0",
  "database": {
    "host": "localhost",
    "port": 5432,
    "name": "demo_db"
  },
  "api_token": {
    "value": "sk-demo-token-abc123xyz",
    "expires_at": "2025-01-15T00:00:00Z"
  },
  "ssl_certificate": {
    "path": "/etc/ssl/demo-cert.pem",
    "expires_at": "2025-02-01T00:00:00Z"
  },
  "cache": {
    "enabled": true,
    "ttl_seconds": 3600
  }
}
EOF

    echo -e "${GREEN}✓ Config set to BROKEN state${NC}"
    echo ""
    echo -e "${YELLOW}The server will now fail with:${NC}"
    echo "  - API_TOKEN_EXPIRED"
    echo "  - SSL_CERTIFICATE_EXPIRED"
    echo ""
    echo -e "Run ${BLUE}node server.mjs${NC} to see the error"
}

# Set config to working state (FIXED)
set_working_state() {
    echo -e "${GREEN}Setting up WORKING state (valid config)...${NC}"

    # Set dates to 1 year from now
    FUTURE_DATE=$(date -v+1y +%Y-%m-%dT00:00:00Z 2>/dev/null || date -d "+1 year" +%Y-%m-%dT00:00:00Z)

    cat > "$CONFIG_FILE" << EOF
{
  "app_name": "demo-api",
  "version": "1.2.0",
  "database": {
    "host": "localhost",
    "port": 5432,
    "name": "demo_db"
  },
  "api_token": {
    "value": "sk-demo-token-abc123xyz",
    "expires_at": "${FUTURE_DATE}"
  },
  "ssl_certificate": {
    "path": "/etc/ssl/demo-cert.pem",
    "expires_at": "${FUTURE_DATE}"
  },
  "cache": {
    "enabled": true,
    "ttl_seconds": 3600
  }
}
EOF

    echo -e "${GREEN}✓ Config set to WORKING state${NC}"
    echo ""
    echo -e "Expiry dates set to: ${BLUE}${FUTURE_DATE}${NC}"
    echo ""
    echo -e "Run ${BLUE}node server.mjs${NC} to start the server"
}

# Run the server
run_server() {
    echo -e "${BLUE}Starting demo server...${NC}"
    echo ""
    cd "$DEMO_DIR"
    node server.mjs
}

# Show config status
show_status() {
    echo -e "${BLUE}Current config.json:${NC}"
    echo ""
    cat "$CONFIG_FILE" | head -20
    echo ""

    # Check expiry status
    if command -v jq &> /dev/null; then
        API_EXPIRES=$(jq -r '.api_token.expires_at' "$CONFIG_FILE")
        SSL_EXPIRES=$(jq -r '.ssl_certificate.expires_at' "$CONFIG_FILE")

        echo -e "${YELLOW}Expiry Status:${NC}"
        echo "  API Token expires: $API_EXPIRES"
        echo "  SSL Cert expires:  $SSL_EXPIRES"

        NOW=$(date +%s)
        API_TS=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$API_EXPIRES" +%s 2>/dev/null || date -d "$API_EXPIRES" +%s)

        if [ "$NOW" -gt "$API_TS" ]; then
            echo -e "  Status: ${RED}EXPIRED${NC}"
        else
            echo -e "  Status: ${GREEN}VALID${NC}"
        fi
    else
        echo -e "${YELLOW}(Install jq for detailed status)${NC}"
    fi
}

# View logs
view_logs() {
    LOG_FILE="$LOG_DIR/app.log"
    if [ -f "$LOG_FILE" ]; then
        echo -e "${BLUE}Recent logs (last 30 lines):${NC}"
        echo ""
        tail -30 "$LOG_FILE"
    else
        echo -e "${YELLOW}No logs yet. Run the server first.${NC}"
    fi
}

# Clear logs
clear_logs() {
    rm -f "$LOG_DIR"/*.log
    echo -e "${GREEN}✓ Logs cleared${NC}"
}

# Main loop
while true; do
    show_menu
    case $choice in
        1) set_broken_state ;;
        2) set_working_state ;;
        3) run_server ;;
        4) show_status ;;
        5) view_logs ;;
        6) clear_logs ;;
        7) echo "Bye!"; exit 0 ;;
        *) echo -e "${RED}Invalid option${NC}" ;;
    esac
done
