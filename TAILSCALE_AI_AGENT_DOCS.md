# Tailscale AI Agent Documentation

This document provides comprehensive information about Tailscale for AI agents to assist users with Tailscale-related tasks.

---

## Overview

**Tailscale** is a mesh VPN service that securely connects devices and services across different networks. It uses the open-source **WireGuard** protocol to establish encrypted peer-to-peer connections.

### Key Characteristics

- **Mesh Network Architecture**: Creates a decentralized peer-to-peer network called a "tailnet"
- **WireGuard-based**: Uses state-of-the-art encryption with excellent performance
- **Zero Configuration**: Networks deploy in minutes without complex setup
- **End-to-End Encryption**: All traffic is encrypted between devices
- **Zero Trust Architecture**: Default deny policy with explicit access controls

### Mesh vs Traditional VPN

| Traditional VPN | Tailscale |
|----------------|-----------|
| Centralized gateway | Peer-to-peer mesh |
| Single point of failure | Distributed, resilient |
| Higher latency | Direct connections, lower latency |
| Bandwidth bottleneck | No central bottleneck |

---

## Core Components

### Tailnet
A tailnet is your private Tailscale network containing all your connected devices. Each tailnet has:
- Unique device addresses (100.x.x.x range)
- MagicDNS names for easy device discovery
- Centralized access control policies

### Coordination Server
Manages device discovery and authentication. Handles:
- Device registration
- Key exchange coordination
- Access policy distribution

### DERP Relays
Fallback relay servers that enable connectivity when direct peer connections fail due to NAT or firewall restrictions.

---

## CLI Reference

### Connection Management

```bash
# Connect to Tailscale
tailscale up

# Disconnect from Tailscale
tailscale down

# Log in and add device to network
tailscale login

# Log out and expire current session
tailscale logout

# Switch between Tailscale accounts
tailscale switch
```

### Network Information

```bash
# Get connection status
tailscale status

# Get device's Tailscale IP
tailscale ip

# Look up machine/user by Tailscale IP
tailscale whois <ip>

# Check network conditions
tailscale netcheck

# Ping another device
tailscale ping <hostname-or-ip>

# Connect to a port via stdin/stdout
tailscale nc <host> <port>
```

### Configuration

```bash
# Change preferences
tailscale set <options>

# Configure resources (kubeconfig, mac-vpn, synology, sysext, systray)
tailscale configure <resource>

# Get exit node information
tailscale exit-node list
```

### File & Service Sharing

```bash
# File sharing via Taildrop
tailscale file <subcommand>

# Share directories with Taildrive
tailscale drive <subcommand>

# Serve content to the internet
tailscale funnel <port>

# Serve content locally to tailnet
tailscale serve <port>
```

### Security & Certificates

```bash
# Manage Tailnet Lock
tailscale lock <subcommand>

# Generate HTTPS certificates
tailscale cert <domain>
```

### SSH

```bash
# Establish Tailscale SSH session
tailscale ssh <user>@<host>
```

### Diagnostics

```bash
# Generate bug report
tailscale bugreport

# Access DNS settings
tailscale dns <subcommand>

# Expose/collect metrics
tailscale metrics

# List/reload system policies
tailscale syspolicy

# Print version
tailscale version

# Update to latest version
tailscale update
```

---

## Subnet Router Configuration

Subnet routers bridge your tailnet with traditional networks.

### Setup Steps

1. **Enable IP Forwarding (Linux)**
```bash
echo 'net.ipv4.ip_forward = 1' | sudo tee -a /etc/sysctl.d/99-tailscale.conf
echo 'net.ipv6.conf.all.forwarding = 1' | sudo tee -a /etc/sysctl.d/99-tailscale.conf
sudo sysctl -p /etc/sysctl.d/99-tailscale.conf
```

2. **Enable Masquerading (for firewalld)**
```bash
firewall-cmd --permanent --add-masquerade
```

3. **Advertise Routes**
```bash
sudo tailscale set --advertise-routes=192.168.1.0/24,10.0.0.0/8
```

4. **Approve Routes**: Use admin console at https://login.tailscale.com/admin

5. **Accept Routes on Clients (Linux)**
```bash
sudo tailscale set --accept-routes
```

### Advanced Options

```bash
# Disable SNAT (preserve source IPs)
tailscale up --snat-subnet-routes=false

# Advertise as exit node
tailscale up --advertise-exit-node
```

---

## Access Control Lists (ACLs)

### Default Behavior
- **Deny-by-default**: No communication without explicit rules
- **Directional**: Rules are one-way unless bidirectional access is configured
- **Locally Enforced**: Each device enforces incoming connection rules

### ACL Syntax

```json
{
  "acls": [
    {
      "action": "accept",
      "src": ["group:developers"],
      "dst": ["tag:servers:*"]
    },
    {
      "action": "accept",
      "src": ["user@example.com"],
      "dst": ["192.168.1.0/24:22"]
    }
  ]
}
```

### Source/Destination Types

| Type | Example | Description |
|------|---------|-------------|
| IP Address | `100.101.102.103` | Specific Tailscale IP |
| CIDR | `192.168.1.0/24` | Subnet range |
| User | `user@example.com` | Specific user |
| Group | `group:developers` | User group |
| Tag | `tag:servers` | Tagged devices |
| Autogroup | `autogroup:member` | Built-in groups |
| Host alias | `myserver` | Defined in hosts section |

### Port Specifications

```json
"dst": [
  "tag:web:80,443",      // Specific ports
  "tag:ssh:22",          // Single port
  "tag:all:*"            // All ports
]
```

### Example ACL Configurations

**Allow all members to access tagged servers:**
```json
{
  "acls": [
    {
      "action": "accept",
      "src": ["autogroup:member"],
      "dst": ["tag:servers:*"]
    }
  ]
}
```

**Restrict SSH access to admins:**
```json
{
  "acls": [
    {
      "action": "accept",
      "src": ["group:admins"],
      "dst": ["tag:servers:22"]
    }
  ]
}
```

**Deny all traffic (empty ACL):**
```json
{
  "acls": []
}
```

---

## API Reference

### Authentication

API access requires an access token generated from the admin console.

**Generating Tokens:**
1. Navigate to https://login.tailscale.com/admin/settings/keys
2. Create new access token
3. Set expiry (1-90 days)
4. Copy token (shown once)

**Required Roles:** Owner, Admin, IT admin, or Network admin

**API Base URL:** `https://api.tailscale.com/api/v2`

### Common API Patterns

```bash
# List devices
curl -u "<api-key>:" https://api.tailscale.com/api/v2/tailnet/-/devices

# Get specific device
curl -u "<api-key>:" https://api.tailscale.com/api/v2/device/<device-id>

# Delete device
curl -X DELETE -u "<api-key>:" https://api.tailscale.com/api/v2/device/<device-id>
```

### Interactive API Documentation
Full API reference available at: https://tailscale.com/api

---

## Key Features

### MagicDNS
Automatic DNS for all devices in your tailnet:
- Access devices by name: `myserver.tailnet-name.ts.net`
- No manual DNS configuration required

### Tailscale SSH
SSH without managing keys:
```bash
tailscale ssh user@hostname
```
- Uses Tailscale identity for authentication
- Session recording available

### Taildrop
Peer-to-peer file sharing:
```bash
# Send file
tailscale file cp myfile.txt hostname:

# Receive files
tailscale file get ./downloads/
```

### Tailscale Serve
Expose local services to your tailnet:
```bash
# Serve local port 3000 on HTTPS
tailscale serve https / http://localhost:3000
```

### Tailscale Funnel
Expose services to the public internet:
```bash
# Expose to internet
tailscale funnel 443
```

### Exit Nodes
Route all traffic through a specific device:
```bash
# Advertise as exit node
tailscale up --advertise-exit-node

# Use an exit node
tailscale up --exit-node=<hostname>
```

### Tailnet Lock
Cryptographic verification for device additions:
```bash
# Initialize lock
tailscale lock init

# Sign a node
tailscale lock sign <node-key>
```

---

## Installation

### Linux
```bash
curl -fsSL https://tailscale.com/install.sh | sh
```

### macOS
```bash
brew install tailscale
```
Or download from: https://tailscale.com/download/mac

### Windows
Download installer from: https://tailscale.com/download/windows

### Docker
```bash
docker run -d --name tailscale \
  -v /var/lib/tailscale:/var/lib/tailscale \
  -v /dev/net/tun:/dev/net/tun \
  --cap-add=NET_ADMIN \
  --cap-add=NET_RAW \
  tailscale/tailscale
```

---

## Common Troubleshooting

### Connection Issues
```bash
# Check network conditions
tailscale netcheck

# Generate diagnostic report
tailscale bugreport

# Check status
tailscale status
```

### DNS Issues
```bash
# Check DNS configuration
tailscale dns status
```

### Firewall Considerations
Tailscale requires:
- UDP port 41641 (direct connections)
- HTTPS port 443 (control plane, DERP fallback)

---

## Glossary

| Term | Definition |
|------|------------|
| **Tailnet** | Your private Tailscale network |
| **DERP** | Designated Encrypted Relay for Packets - fallback relay servers |
| **MagicDNS** | Automatic DNS for tailnet devices |
| **Coordination Server** | Manages device discovery and authentication |
| **Exit Node** | Device that routes all traffic for other nodes |
| **Subnet Router** | Device that advertises routes to non-Tailscale networks |
| **ACL** | Access Control List - defines allowed connections |
| **Tag** | Label applied to devices for policy management |
| **Taildrop** | Peer-to-peer file sharing feature |
| **Funnel** | Expose local services to the public internet |

---

## Useful Links

- Documentation: https://tailscale.com/docs
- API Reference: https://tailscale.com/api
- Admin Console: https://login.tailscale.com/admin
- Download: https://tailscale.com/download
- Status Page: https://status.tailscale.com
- GitHub: https://github.com/tailscale/tailscale

---

## Agent Task Examples

### Help user connect a new device
1. Guide installation for their platform
2. Run `tailscale up` to authenticate
3. Verify with `tailscale status`

### Configure subnet routing
1. Enable IP forwarding on router device
2. Advertise routes with `tailscale set --advertise-routes`
3. Approve routes in admin console
4. Enable `--accept-routes` on clients

### Set up access controls
1. Review current ACL policy
2. Define groups/tags as needed
3. Write ACL rules with appropriate src/dst
4. Test connectivity after applying

### Troubleshoot connectivity
1. Run `tailscale status` to check connection state
2. Use `tailscale ping <target>` to test reachability
3. Run `tailscale netcheck` for network diagnostics
4. Generate `tailscale bugreport` if issues persist
