#!/usr/bin/env node
const { execSync } = require('node:child_process');

function runCommand(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  }
  catch {
    return null;
  }
}

function setupAdb() {
  console.log('\n[HandyGo ADB] 🔍 Đang quét thiết bị Android (máy thật USB & máy ảo)...');

  // Check if adb is installed and in PATH
  const adbCheck = runCommand('adb version');
  if (!adbCheck) {
    console.warn('[HandyGo ADB] ⚠️ Không tìm thấy lệnh `adb` trong PATH. Bỏ qua cấu hình cổng USB.');
    return;
  }

  const devicesOutput = runCommand('adb devices');
  if (!devicesOutput) {
    console.warn('[HandyGo ADB] ⚠️ Không thể truy vấn danh sách thiết bị từ ADB.');
    return;
  }

  // Parse lines: <serial>\t<state>
  const lines = devicesOutput.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const devices = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(/\s+/);
    if (parts.length >= 2) {
      devices.push({ serial: parts[0], state: parts[1] });
    }
  }

  if (devices.length === 0) {
    console.log('[HandyGo ADB] ℹ️ Chưa có thiết bị Android nào được kết nối.');
    console.log('[HandyGo ADB] 👉 Để chạy trên máy thật: Cắm cáp USB và bật "Gỡ lỗi USB" (USB Debugging).');
    console.log('[HandyGo ADB] 👉 Hoặc mở Android Emulator nếu muốn chạy máy ảo.\n');
    return;
  }

  // Filter physical devices (non-emulator) and emulators
  const physicalDevices = devices.filter(d => !d.serial.startsWith('emulator-') && d.state === 'device');
  const emulators = devices.filter(d => d.serial.startsWith('emulator-') && d.state === 'device');
  const unauthorized = devices.filter(d => d.state === 'unauthorized');

  if (unauthorized.length > 0) {
    console.warn(`[HandyGo ADB] ⚠️ Thiết bị chưa được cấp quyền RSA (${unauthorized.map(d => d.serial).join(', ')}).`);
    console.warn('[HandyGo ADB] 👉 Vui lòng mở khóa điện thoại và bấm "Cho phép / Always allow" trên màn hình.');
  }

  // Ưu tiên máy thật cắm USB trước, nếu không có máy thật thì fallback sang máy ảo
  const isPhysical = physicalDevices.length > 0;
  const targets = isPhysical ? physicalDevices : emulators;

  if (targets.length === 0) {
    console.warn('[HandyGo ADB] ⚠️ Không tìm thấy thiết bị nào ở trạng thái sẵn sàng (device).');
    return;
  }

  const label = isPhysical ? '📱 Máy thật cắm USB' : '💻 Máy ảo Android Emulator (fallback)';

  for (const target of targets) {
    console.log(`[HandyGo ADB] ${label}: [${target.serial}]`);

    // Reverse port 3000 (API Gateway -> Host PC)
    const rev3000 = runCommand(`adb -s ${target.serial} reverse tcp:3000 tcp:3000`);
    // Reverse port 8081 (Metro Bundler -> Host PC)
    const rev8081 = runCommand(`adb -s ${target.serial} reverse tcp:8081 tcp:8081`);

    if (rev3000 !== null && rev8081 !== null) {
      console.log(`[HandyGo ADB]   ✅ Đã tự động reverse port thành công:`);
      console.log(`[HandyGo ADB]      - tcp:3000 (API Backend Gateway -> PC:3000)`);
      console.log(`[HandyGo ADB]      - tcp:8081 (Metro Bundler -> PC:8081)`);
    }
    else {
      console.warn(`[HandyGo ADB]   ⚠️ Cảnh báo: Không thể cấu hình reverse port trên thiết bị ${target.serial}.`);
    }
  }

  console.log('[HandyGo ADB] 🚀 Sẵn sàng kết nối Backend tại http://127.0.0.1:3000/api/v1\n');
}

try {
  setupAdb();
}
catch (e) {
  // Never crash npm/expo start scripts
  console.warn('[HandyGo ADB] Lỗi kiểm tra thiết bị ADB:', e.message);
}
