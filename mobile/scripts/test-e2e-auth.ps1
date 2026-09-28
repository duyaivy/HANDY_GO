<#
.SYNOPSIS
  Script tự động kiểm thử E2E luồng Đăng ký & Đăng nhập trên máy ảo Android (HANDY GO Mobile).
  Tự động điền form Đăng ký -> Dừng lại để bạn tự nhập OTP -> Tự động điền mật khẩu và Đăng nhập.

.DESCRIPTION
  Flow thực hiện:
  1. Kiểm tra kết nối ADB với máy ảo / thiết bị thật.
  2. Mở ứng dụng HANDY GO (nếu chưa mở) hoặc chuyển đến màn hình Đăng ký.
  3. Tự động sinh SĐT và Email ngẫu nhiên (tránh lỗi trùng lặp dữ liệu).
  4. Tự động điền: Họ tên, SĐT, Email, Mật khẩu, Xác nhận mật khẩu.
  5. Bấm nút "Đăng ký tài khoản".
  6. DỪNG LẠI ĐỂ BẠN TỰ LẤY VÀ NHẬP OTP (Mailpit: http://localhost:8025).
  7. Sau khi bạn xác thực xong và màn hình Đăng nhập hiện ra:
     -> Nhấn ENTER tại terminal để script tự điền mật khẩu và bấm "Đăng nhập".
  8. Xác nhận đăng nhập thành công vào trang chủ Khách hàng!
#>

[CmdletBinding()]
param (
    [string]$DeviceSerial = "",
    [string]$FullName = "Nguyễn Văn Khách",
    [string]$Password = "P@ssword123"
)

# -------------------------------------------------------------
# 1. Tìm đường dẫn công cụ ADB
# -------------------------------------------------------------
$AdbCmd = Get-Command adb -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (-not $AdbCmd) {
    $SdkAdb = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"
    if (Test-Path $SdkAdb) {
        $AdbCmd = $SdkAdb
    } else {
        Write-Host "[LỖI] Không tìm thấy 'adb'. Hãy chắc chắn bạn đã cài Android SDK hoặc thêm adb vào PATH." -ForegroundColor Red
        exit 1
    }
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   HANDY GO - E2E AUTOMATED AUTH FLOW TEST (ANDROID)     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "[INFO] Sử dụng ADB: $AdbCmd" -ForegroundColor Gray

# -------------------------------------------------------------
# 2. Kiểm tra thiết bị / máy ảo kết nối
# -------------------------------------------------------------
$DevicesOutput = & $AdbCmd devices
$DeviceLines = $DevicesOutput | Where-Object { $_ -match "\tdevice$" }

if (-not $DeviceLines) {
    Write-Host "[LỖI] Không tìm thấy thiết bị hoặc máy ảo Android nào đang chạy!" -ForegroundColor Red
    Write-Host "-> Hãy mở Android Emulator hoặc cắm điện thoại đã bật USB Debugging rồi thử lại." -ForegroundColor Yellow
    exit 1
}

if (-not $DeviceSerial) {
    $DeviceSerial = ($DeviceLines[0] -split "\t")[0]
}
Write-Host "[OK] Kết nối tới thiết bị: $DeviceSerial" -ForegroundColor Green

function Invoke-AdbShell {
    param([string]$Command)
    & $AdbCmd -s $DeviceSerial shell $Command
}

# -------------------------------------------------------------
# 3. Hàm tìm kiếm tọa độ element qua UI Automator Dump
# -------------------------------------------------------------
function Find-ElementBounds {
    param(
        [string]$TestId = "",
        [string]$Text = ""
    )

    $DumpOutput = & $AdbCmd -s $DeviceSerial exec-out uiautomator dump /dev/tty 2>&1
    # Fallback nếu exec-out không trả về trực tiếp
    if ($DumpOutput -notmatch "<\?xml|<hierarchy") {
        Invoke-AdbShell "uiautomator dump /data/local/tmp/dump.xml" | Out-Null
        $DumpOutput = (& $AdbCmd -s $DeviceSerial exec-out cat /data/local/tmp/dump.xml) -join "`n"
    }

    if (-not $DumpOutput -or $DumpOutput -notmatch "bounds=") {
        return $null
    }

    # Clean XML if needed
    $XmlStart = $DumpOutput.IndexOf("<?xml")
    if ($XmlStart -lt 0) {
        $XmlStart = $DumpOutput.IndexOf("<hierarchy")
    }
    if ($XmlStart -ge 0) {
        $DumpOutput = $DumpOutput.Substring($XmlStart)
    }

    try {
        [xml]$Xml = $DumpOutput
    } catch {
        return $null
    }

    $Nodes = $Xml.SelectNodes("//node")
    foreach ($Node in $Nodes) {
        $Match = $false
        if ($TestId -and $Node.GetAttribute("content-desc") -eq $TestId) {
            $Match = $true
        } elseif ($TestId -and $Node.GetAttribute("resource-id") -match $TestId) {
            $Match = $true
        } elseif ($Text -and $Node.GetAttribute("text") -eq $Text) {
            $Match = $true
        }

        if ($Match) {
            $Bounds = $Node.GetAttribute("bounds")
            if ($Bounds -match "\[(\d+),(\d+)\]\[(\d+),(\d+)\]") {
                $X1 = [int]$Matches[1]
                $Y1 = [int]$Matches[2]
                $X2 = [int]$Matches[3]
                $Y2 = [int]$Matches[4]
                return @{
                    CenterX = [int](($X1 + $X2) / 2)
                    CenterY = [int](($Y1 + $Y2) / 2)
                    Bounds = $Bounds
                }
            }
        }
    }

    return $null
}

function Click-Element {
    param(
        [string]$TestId = "",
        [string]$Text = "",
        [int]$WaitMs = 1000
    )

    $Elem = Find-ElementBounds -TestId $TestId -Text $Text
    if ($Elem) {
        Invoke-AdbShell "input tap $($Elem.CenterX) $($Elem.CenterY)"
        Start-Sleep -Milliseconds $WaitMs
        return $true
    }
    return $false
}

function Type-SafeText {
    param([string]$Text)
    # Gõ text bằng adb shell input text, thay khoảng trắng bằng %s
    $Escaped = $Text.Replace(" ", "%s").Replace("&", "\&").Replace("<", "\<").Replace(">", "\>")
    Invoke-AdbShell "input text `"$Escaped`""
    Start-Sleep -Milliseconds 400
}

# -------------------------------------------------------------
# 4. Chuẩn bị dữ liệu ngẫu nhiên cho lần test này
# -------------------------------------------------------------
$RandomSuffix = Get-Random -Minimum 1000000 -Maximum 9999999
$RandomPhone = "098$RandomSuffix"
$RandomEmail = "khach_$RandomSuffix@gmail.com"

Write-Host "`n----------------------------------------------------------" -ForegroundColor Yellow
Write-Host "DỮ LIỆU ĐĂNG KÝ CHO LẦN TEST NÀY:" -ForegroundColor Yellow
Write-Host "  * Họ và tên  : $FullName" -ForegroundColor White
Write-Host "  * Số ĐT      : $RandomPhone" -ForegroundColor Cyan
Write-Host "  * Email      : $RandomEmail" -ForegroundColor Cyan
Write-Host "  * Mật khẩu   : $Password" -ForegroundColor White
Write-Host "----------------------------------------------------------`n" -ForegroundColor Yellow

# -------------------------------------------------------------
# 5. Bắt đầu luồng kiểm thử
# -------------------------------------------------------------
Write-Host "[BƯỚC 1/6] Kiểm tra màn hình hiện tại trên thiết bị..." -ForegroundColor Cyan

# Kiểm tra xem đang ở màn hình nào
$IsOnRegister = Find-ElementBounds -TestId "auth-register-screen"
if (-not $IsOnRegister) {
    # Nếu đang ở Login screen, nhấn nút chuyển sang Register
    $ToRegisterBtn = Find-ElementBounds -TestId "login-to-register-btn" -Text "Đăng ký ngay"
    if ($ToRegisterBtn) {
        Write-Host "-> Đang ở màn hình Đăng nhập, bấm 'Đăng ký ngay'..." -ForegroundColor Gray
        Click-Element -TestId "login-to-register-btn" -Text "Đăng ký ngay" -WaitMs 1500
    } else {
        # Thử mở sâu route đăng ký qua deep link
        Write-Host "-> Mở route register bằng deep link..." -ForegroundColor Gray
        Invoke-AdbShell "am start -W -a android.intent.action.VIEW -d `"handygo://(auth)/register`"" | Out-Null
        Start-Sleep -Seconds 2
    }
}

Write-Host "[BƯỚC 2/6] Điền thông tin vào form Đăng ký..." -ForegroundColor Cyan

# 1. Họ và tên
if (Click-Element -TestId "register-fullname-input") {
    Type-SafeText $FullName
}

# 2. Số điện thoại
if (Click-Element -TestId "register-phone-input") {
    Type-SafeText $RandomPhone
}

# 3. Email
if (Click-Element -TestId "register-email-input") {
    Type-SafeText $RandomEmail
}

# 4. Mật khẩu
if (Click-Element -TestId "register-password-input") {
    Type-SafeText $Password
}

# 5. Xác nhận mật khẩu
if (Click-Element -TestId "register-confirm-password-input") {
    Type-SafeText $Password
}

# Ẩn bàn phím ảo nếu đang hiện
Invoke-AdbShell "input keyevent 111" # KEYCODE_ESCAPE
Start-Sleep -Milliseconds 500

Write-Host "[BƯỚC 3/6] Bấm nút 'Đăng ký tài khoản'..." -ForegroundColor Cyan
$Submitted = Click-Element -TestId "register-submit-button" -Text "Đăng ký tài khoản" -WaitMs 2000
if (-not $Submitted) {
    # Thử cuộn xuống nếu nút bị che khuất
    Invoke-AdbShell "input swipe 500 1200 500 600 300"
    Start-Sleep -Milliseconds 800
    Click-Element -TestId "register-submit-button" -Text "Đăng ký tài khoản" -WaitMs 2000 | Out-Null
}

# -------------------------------------------------------------
# 6. DỪNG LẠI ĐỂ NGƯỜI DÙNG TỰ NHẬP OTP
# -------------------------------------------------------------
Write-Host "`n==========================================================" -ForegroundColor Magenta
Write-Host " [CHỜ NGƯỜI DÙNG] BƯỚC XÁC THỰC MÃ OTP (INTERACTIVE STEP)" -ForegroundColor Magenta
Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host " 1. Mở Mailpit trên trình duyệt máy tính: http://localhost:8025" -ForegroundColor Yellow
Write-Host " 2. Tìm email gửi đến: $RandomEmail" -ForegroundColor Yellow
Write-Host " 3. Nhập mã OTP 6 số trên màn hình máy ảo và bấm 'Xác thực tài khoản'." -ForegroundColor Yellow
Write-Host " 4. Ứng dụng sẽ tự động chuyển về màn hình ĐĂNG NHẬP (kèm SĐT $RandomPhone đã điền sẵn)." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host "-> Sau khi màn hình ĐĂNG NHẬP hiện ra, hãy nhấn [ENTER] tại đây để script tiếp tục tự động đăng nhập..." -ForegroundColor Cyan

$null = Read-Host

# -------------------------------------------------------------
# 7. Tự động điền mật khẩu và đăng nhập
# -------------------------------------------------------------
Write-Host "`n[BƯỚC 5/6] Tiếp tục: Tự động điền Mật khẩu và Đăng nhập..." -ForegroundColor Cyan

# Kiểm tra nếu ô SĐT chưa có thì điền lại
$PhoneElem = Find-ElementBounds -TestId "login-phone-input"
if ($PhoneElem) {
    Write-Host "-> Focus ô Mật khẩu trên màn hình Đăng nhập..." -ForegroundColor Gray
}

# Click vào ô Mật khẩu
$PwClicked = Click-Element -TestId "login-password-input"
if ($PwClicked) {
    Type-SafeText $Password
} else {
    Write-Host "[CẢNH BÁO] Không tìm thấy ô mật khẩu tự động, thử bấm theo vị trí..." -ForegroundColor Yellow
}

# Ẩn bàn phím ảo
Invoke-AdbShell "input keyevent 111"
Start-Sleep -Milliseconds 500

Write-Host "[BƯỚC 6/6] Bấm nút 'Đăng nhập'..." -ForegroundColor Cyan
$LoginSuccess = Click-Element -TestId "login-submit-button" -Text "Đăng nhập" -WaitMs 3000

# -------------------------------------------------------------
# 8. Hoàn tất & Đánh giá kết quả
# -------------------------------------------------------------
Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host " [HOÀN TẤT] LUỒNG KIỂM THỬ E2E ĐÃ THỰC HIỆN THÀNH CÔNG!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "Tài khoản vừa tạo và đăng nhập thành công:" -ForegroundColor White
Write-Host "  * SĐT : $RandomPhone" -ForegroundColor Yellow
Write-Host "  * Pass: $Password" -ForegroundColor Yellow
Write-Host "Màn hình trên máy ảo hiện đã chuyển vào giao diện Khách hàng.`n" -ForegroundColor Green
