# Hướng dẫn chuẩn bị VPS4 và máy chủ
## Cấu hình máy chủ chuyên dụng cho Message Service

**Dự án:** HANDY_GO  
**Máy chủ đích:** VPS4 (`10.77.0.4`)  
**Vai trò đích:** `vps4` (Message Service - NestJS + Socket.IO)  
**Cấu hình yêu cầu:** 1 vCPU, RAM >= 1 GB, SSD 20 GB, Ubuntu 22.04 / 24.04 LTS

---

## 1. Điều kiện tiên quyết và quyền truy cập ban đầu

Hướng dẫn này dùng tài khoản `azureuser`, đúng với workflow production hiện tại. Các lệnh máy chủ chạy bằng `sudo`; GitHub Actions đăng nhập vào VPS bằng key của `azureuser`. Không tạo tài khoản `deploy` riêng.

Topology WireGuard production là full mesh: VPS1, VPS2, VPS3 và VPS4 đều có peer tới ba VPS còn lại. Vì Message Service trên VPS4 cần nhận request proxy từ VPS1 và có thể gọi service ở VPS2/VPS3, hãy thêm peer VPS4 trên **cả VPS1, VPS2, VPS3**, đồng thời khai báo ba peer đó trong cấu hình VPS4. Không chỉ thêm peer VPS1.


1. Nhận địa chỉ IP máy chủ (`<VPS4_PUBLIC_IP>`) và quyền SSH bằng `azureuser` (có `sudo`) từ nhà cung cấp dịch vụ lưu trữ.
2. Đảm bảo VPS1 (`10.77.0.1`), VPS2 (`10.77.0.2`) và VPS3 (`10.77.0.3`) có thể kết nối mạng tới `<VPS4_PUBLIC_IP>` qua cổng UDP 51820 (WireGuard).

---

## 2. Cấu hình hệ thống cơ bản và cài đặt thành phần phụ thuộc

Đăng nhập VPS4 bằng tài khoản `azureuser`:
```bash
ssh azureuser@<VPS4_PUBLIC_IP>
```
Nếu nhà cung cấp cấp tài khoản khác, dùng tài khoản đó để đăng nhập và đảm bảo tài khoản `azureuser` tồn tại, có quyền sudo, rồi chuyển sang `azureuser`.

### 2.1 Cập nhật các gói hệ thống
```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y \
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

### 2.2 Cài Docker Engine và Docker Compose
```bash
# Thêm khóa GPG chính thức của Docker
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Thêm kho gói Docker
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Bật và khởi chạy Docker
sudo systemctl enable --now docker
sudo usermod -aG docker azureuser
sudo docker run --rm hello-world
```

### 2.3 Tinh chỉnh kernel và giới hạn tệp
Chỉnh sửa `/etc/sysctl.d/99-handygo.conf`:
```ini
# Bật chuyển tiếp gói tin cho WireGuard và Docker
net.ipv4.ip_forward = 1

# Tối ưu số lượng file handle và kết nối socket cho Socket.IO
fs.file-max = 2097152
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 8192
net.ipv4.tcp_fin_timeout = 30
net.ipv4.tcp_keepalive_time = 120
net.ipv4.tcp_keepalive_intvl = 30
net.ipv4.tcp_keepalive_probes = 5
```
Áp dụng cấu hình:
```bash
sudo sysctl --system
```

---

## 3. Tài khoản `azureuser` và thư mục triển khai

Workflow hiện đăng nhập bằng `azureuser`. Kiểm tra user và quyền sudo:
```bash
id azureuser
sudo -v
```

Cài public key dành riêng cho VPS4 vào `authorized_keys` của `azureuser`. Thay placeholder bằng **một dòng public key** đã tạo trên máy quản trị; giữ nguyên các key hiện có:
```bash
sudo install -d -o azureuser -g azureuser -m 700 /home/azureuser/.ssh
sudo touch /home/azureuser/.ssh/authorized_keys
sudo chmod 600 /home/azureuser/.ssh/authorized_keys
sudo sh -c 'printf "%s\n" "<VPS4_DEPLOYMENT_PUBLIC_KEY>" >> /home/azureuser/.ssh/authorized_keys'
sudo chown azureuser:azureuser /home/azureuser/.ssh/authorized_keys
```

Sau đó từ máy quản trị, thử `ssh -i <PRIVATE_KEY_FILE> azureuser@<VPS4_PUBLIC_IP>`. GitHub Secret `VPS4_SSH_KEY` phải chứa private key tương ứng, nhiều dòng đầy đủ BEGIN/END.

Cài các thư mục được deployment automation sử dụng:
```bash
sudo install -d -o azureuser -g azureuser -m 700 /opt/handygo /opt/handygo/releases
sudo install -d -o azureuser -g azureuser -m 700 /home/azureuser/.ssh
```

### 3.1 Tạo metadata host (`/opt/handygo/host.json`)

Lệnh sau tạo đúng metadata mà deployment coordinator đọc:
```bash
printf '{"role":"vps4","private_ip":"10.77.0.4","public_ip":"%s"}\n' '<VPS4_PUBLIC_IP>' | sudo tee /opt/handygo/host.json > /dev/null
sudo chown azureuser:azureuser /opt/handygo/host.json
sudo chmod 600 /opt/handygo/host.json
cat /opt/handygo/host.json
```

---

## 4. Cấu hình VPN WireGuard (`10.77.0.4`)

### 4.1 Tạo cặp khóa trên VPS4
```bash
sudo install -d -m 700 /etc/wireguard
sudo sh -c 'umask 077; wg genkey > /etc/wireguard/privatekey; wg pubkey < /etc/wireguard/privatekey > /etc/wireguard/publickey'
Lấy khóa công khai:
```bash
sudo cat /etc/wireguard/publickey
```
*(Lưu khóa công khai này — cần đăng ký nó làm peer trên VPS1, VPS2 và VPS3.)*

### 4.2 Cấu hình `/etc/wireguard/wg0.conf`
Tạo `/etc/wireguard/wg0.conf`:
```ini
[Interface]
Address = 10.77.0.4/24
PrivateKey = <VPS4_PRIVATE_KEY_FROM_STEP_4.1>
ListenPort = 51820

# Peer 1: VPS1 (Reverse Proxy và Edge Gateway)
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

Bảo vệ tệp cấu hình:
```bash
chmod 600 /etc/wireguard/wg0.conf
systemctl enable wg-quick@wg0
systemctl start wg-quick@wg0
```

### 4.3 Thêm peer VPS4 vào VPS1, VPS2 và VPS3

Production dùng full mesh và cả ba template hiện tại đều có peer VPS4. Trên **từng VPS1, VPS2, VPS3**, đăng nhập `azureuser` rồi thêm block tương ứng sau vào cuối `/etc/wireguard/wg0.conf` bằng `sudo nano /etc/wireguard/wg0.conf`. Thay public key và endpoint bằng giá trị thật:

VPS1, VPS2 và VPS3 đều thêm:
```ini
[Peer]
PublicKey = <VPS4_WIREGUARD_PUBLIC_KEY>
Endpoint = <VPS4_PUBLIC_IP>:51820
AllowedIPs = 10.77.0.4/32
PersistentKeepalive = 25
```

Lưu file, kiểm tra cấu hình rồi áp dụng trên mỗi VPS:
```bash
sudo chmod 600 /etc/wireguard/wg0.conf
sudo wg-quick strip wg0 | sudo tee /run/wg0.conf >/dev/null
sudo wg syncconf wg0 /run/wg0.conf
sudo rm /run/wg0.conf
sudo wg show
```

Mỗi VPS cần cho phép UDP 51820 từ public IP của các peer trong firewall của nhà cung cấp. Không thay toàn bộ `wg0.conf` bằng block peer; chỉ thêm đúng một block `[Peer]` VPS4, tránh thêm trùng nếu peer đã tồn tại.

---

## 5. Tường lửa máy chủ (UFW) và khóa chặt cổng

VPS4 tuyệt đối không được mở cổng dịch vụ (`3009`) ra Internet công cộng.

```bash
# Đặt chính sách mặc định
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Cho phép SSH
sudo ufw allow 22/tcp comment 'SSH Management'

# Cho phép lưu lượng VPN WireGuard qua cổng UDP 51820
sudo ufw allow 51820/udp comment 'WireGuard VPN'

# Cho phép lưu lượng nội bộ trên giao diện WireGuard wg0
sudo ufw allow in on wg0 comment 'Internal WireGuard Network'

# Bật tường lửa
sudo ufw --force enable
sudo ufw status verbose
```

Xác minh cổng 3009 KHÔNG mở trên `eth0` / giao diện công cộng:
```bash
# Message Service trong compose chỉ bind vào 10.77.0.4:3009:3009
# UFW mặc định chặn mọi gói tin đến không được yêu cầu từ Internet công cộng
```

---

## 6. Xác minh và kiểm tra bắt tay kết nối

Kiểm tra kết nối giữa các VPS qua WireGuard từ VPS4:
```bash
# Ping VPS1 (Edge)
ping -c 3 10.77.0.1

# Ping VPS2 (Commerce)
ping -c 3 10.77.0.2

# Ping VPS3 (Finance)
ping -c 3 10.77.0.3
```

Kiểm tra trạng thái WireGuard:
```bash
wg show
```
Đảm bảo `latest handshake` của tất cả peer đều trong vòng 120 giây gần nhất.

---

## 7. Đăng ký thông tin xác thực CI/CD

Trước khi bắt đầu triển khai, đăng ký các thông tin sau trong **GitHub Repository Secrets**:
1. `VPS4_HOST`: `<VPS4_PUBLIC_IP>`
2. `VPS4_SSH_KEY`: Khóa SSH riêng có khóa công khai tương ứng đã được đặt trong `/home/azureuser/.ssh/authorized_keys`.

## 8. Đăng ký thông tin xác thực CI/CD

Thêm vào GitHub Environment `production`:
- `VPS4_HOST`: public IP VPS4.
- `VPS4_SSH_KEY`: private key ứng với public key đã thêm vào `/home/azureuser/.ssh/authorized_keys`.

Workflow hiện dùng `azureuser` cho các VPS. Kiểm tra các secret `VPS1_HOST`/`VPS1_SSH_KEY` đến `VPS3_HOST`/`VPS3_SSH_KEY` vẫn còn hợp lệ. Không tạo secret `DEPLOY_USER`; user được workflow đặt cố định là `azureuser`.

## 9. Kiểm tra cuối trước deploy

Trên VPS4:
```bash
id
sudo docker version
sudo docker compose version
ip -4 addr show wg0
sudo wg show
ping -c 3 10.77.0.1
ping -c 3 10.77.0.2
ping -c 3 10.77.0.3
sudo ufw status verbose
```

Trên mỗi VPS1–3, xác nhận `sudo wg show` có peer `10.77.0.4/32` và handshake mới. Thử ping VPS4 từ từng VPS. Cổng Message Service phải chỉ bind trên IP WireGuard `10.77.0.4`, không mở trực tiếp ra Internet.

Máy chủ đã được chuẩn bị và sẵn sàng cho quy trình deploy production hiện hành.
