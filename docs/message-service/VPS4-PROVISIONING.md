# VPS4 Provisioning & Host Preparation Guide
## Message Service Dedicated Host Setup

**Project:** HANDY_GO  
**Target Host:** VPS4 (`10.77.0.4`)  
**Target Role:** `vps4` (Message Service - NestJS + Socket.IO)  
**Required Specs:** 1 vCPU, >= 1 GB RAM, 20 GB SSD, Ubuntu 22.04 / 24.04 LTS  

---

## 1. Prerequisites & Initial Access

1. Obtain server IP (`<VPS4_PUBLIC_IP>`) and root SSH access from hosting provider.
2. Ensure VPS1 (`10.77.0.1`), VPS2 (`10.77.0.2`), and VPS3 (`10.77.0.3`) have network reachability to `<VPS4_PUBLIC_IP>` on UDP port 51820 (WireGuard).

---

## 2. Base System Configuration & Dependencies

SSH into VPS4 as `root`:
```bash
ssh root@<VPS4_PUBLIC_IP>
```

### 2.1 Update System Packages
```bash
apt-get update && apt-get upgrade -y
apt-get install -y \
    curl \
    wget \
    git \
    tar \
    jq \
    wireguard \
    wireguard-tools \
    ufw \
    ca-certificates \
    gnupg \
    lsb-release
```

### 2.2 Install Docker Engine & Docker Compose
```bash
# Add Docker official GPG key
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Enable and start Docker
systemctl enable docker
systemctl start docker
```

### 2.3 Kernel Tuning & File Limits
Edit `/etc/sysctl.d/99-handygo.conf`:
```ini
# Enable packet forwarding for WireGuard & Docker
net.ipv4.ip_forward = 1

# Optimize file handles and socket connections for Socket.IO
fs.file-max = 2097152
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 8192
net.ipv4.tcp_fin_timeout = 30
net.ipv4.tcp_keepalive_time = 120
net.ipv4.tcp_keepalive_intvl = 30
net.ipv4.tcp_keepalive_probes = 5
```
Apply settings:
```bash
sysctl --system
```

---

## 3. Dedicated Deployment User & Directory Structure

Create deployment user `deploy` and grant Docker execution privileges:
```bash
# Create deploy user
useradd -m -s /bin/bash -G docker deploy

# Setup SSH directory for deploy user
mkdir -p /home/deploy/.ssh
chmod 700 /home/deploy/.ssh

# Generate or place deployment SSH public key (matching GitHub Secret VPS4_SSH_KEY)
cat << 'EOF' >> /home/deploy/.ssh/authorized_keys
<YOUR_DEPLOYMENT_PUBLIC_KEY>
EOF
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
```

### 3.1 Host Directory Setup (`/opt/handygo`)
```bash
mkdir -p /opt/handygo/releases
mkdir -p /opt/handygo/shared
chown -R deploy:deploy /opt/handygo
```

Create `/opt/handygo/host.json`:
```json
{
  "role": "vps4",
  "private_ip": "10.77.0.4",
  "public_ip": "<VPS4_PUBLIC_IP>",
  "created_at": "2026-11-06T00:00:00Z"
}
```
Set permissions:
```bash
chown deploy:deploy /opt/handygo/host.json
chmod 644 /opt/handygo/host.json
```

---

## 4. WireGuard VPN Setup (`10.77.0.4`)

### 4.1 Generate Keypair on VPS4
```bash
umask 077
wg genkey | tee /etc/wireguard/privatekey | wg pubkey > /etc/wireguard/publickey
```
Obtain public key:
```bash
cat /etc/wireguard/publickey
```
*(Save this public key — it must be registered as a peer on VPS1, VPS2, and VPS3).*

### 4.2 Configure `/etc/wireguard/wg0.conf`
Create `/etc/wireguard/wg0.conf`:
```ini
[Interface]
Address = 10.77.0.4/24
PrivateKey = <VPS4_PRIVATE_KEY_FROM_STEP_4.1>
ListenPort = 51820

# Peer 1: VPS1 (Reverse Proxy & Edge Gateway)
[Peer]
PublicKey = <VPS1_WIREGUARD_PUBLIC_KEY>
Endpoint = <VPS1_PUBLIC_IP>:51820
AllowedIPs = 10.77.0.1/32
PersistentKeepalive = 25

# Peer 2: VPS2 (Bidding, Order, Tracking)
[Peer]
PublicKey = <VPS2_WIREGUARD_PUBLIC_KEY>
Endpoint = <VPS2_PUBLIC_IP>:51820
AllowedIPs = 10.77.0.2/32
PersistentKeepalive = 25

# Peer 3: VPS3 (Catalog, Payment, Wallet, Lock Coordinator)
[Peer]
PublicKey = <VPS3_WIREGUARD_PUBLIC_KEY>
Endpoint = <VPS3_PUBLIC_IP>:51820
AllowedIPs = 10.77.0.3/32
PersistentKeepalive = 25
```

Secure configuration:
```bash
chmod 600 /etc/wireguard/wg0.conf
systemctl enable wg-quick@wg0
systemctl start wg-quick@wg0
```

### 4.3 Update Existing Peers (VPS1, VPS2, VPS3)
On VPS1 (`/etc/wireguard/wg0.conf`):
```ini
# Add VPS4 Peer
[Peer]
PublicKey = <VPS4_WIREGUARD_PUBLIC_KEY>
AllowedIPs = 10.77.0.4/32
```
Reload WireGuard on VPS1:
```bash
wg syncconf wg0 <(wg-quick strip wg0)
```
Repeat peer addition on VPS2 and VPS3 if direct mesh is desired.

---

## 5. Host Firewall (UFW) & Port Hardening

VPS4 must NEVER expose service ports (`3009`) to the public internet.

```bash
# Set default policies
ufw default deny incoming
ufw default allow outgoing

# Allow SSH
ufw allow 22/tcp comment 'SSH Management'

# Allow WireGuard VPN traffic on UDP port 51820
ufw allow 51820/udp comment 'WireGuard VPN'

# Allow internal traffic on WireGuard interface wg0
ufw allow in on wg0 comment 'Internal WireGuard Network'

# Enable firewall
ufw --force enable
ufw status verbose
```

Verify that port 3009 is NOT open on `eth0` / public interface:
```bash
# Message service in compose binds strictly to 10.77.0.4:3009:3009
# UFW drops all unsolicited public incoming packets by default
```

---

## 6. Verification & Handshake Check

Test inter-VPS connectivity over WireGuard from VPS4:
```bash
# Ping VPS1 (Edge)
ping -c 3 10.77.0.1

# Ping VPS2 (Commerce)
ping -c 3 10.77.0.2

# Ping VPS3 (Finance)
ping -c 3 10.77.0.3
```

Check WireGuard status:
```bash
wg show
```
Ensure `latest handshake` is within the last 120 seconds for all peers.

---

## 7. CI/CD Credentials Registration

Before initiating deployment, register the following in **GitHub Repository Secrets**:
1. `VPS4_HOST`: `<VPS4_PUBLIC_IP>`
2. `VPS4_SSH_KEY`: The private SSH key whose public counterpart was placed in `/home/deploy/.ssh/authorized_keys`.

The host is now fully provisioned and ready for transactional release.
