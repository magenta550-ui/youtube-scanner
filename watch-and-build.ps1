# YouTube Scanner - 자동 감시 & 빌드 스크립트
# 실행: PowerShell에서 .\watch-and-build.ps1

$REPO = "magenta550-ui/youtube-scanner"
$BRANCH = "main"
$PROJECT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$CHECK_INTERVAL = 30  # 초

$lastSha = ""

function Show-Notification($title, $message, $type = "Info") {
    $icon = switch ($type) {
        "Info"    { "Information" }
        "Success" { "Information" }
        "Error"   { "Error" }
        default   { "Information" }
    }
    Add-Type -AssemblyName System.Windows.Forms
    $notify = New-Object System.Windows.Forms.NotifyIcon
    $notify.Icon = [System.Drawing.SystemIcons]::$icon
    $notify.BalloonTipTitle = $title
    $notify.BalloonTipText = $message
    $notify.Visible = $true
    $notify.ShowBalloonTip(4000)
    Start-Sleep -Milliseconds 500
    $notify.Dispose()
}

function Get-LatestCommitSha {
    try {
        $url = "https://api.github.com/repos/$REPO/branches/$BRANCH"
        $response = Invoke-RestMethod -Uri $url -Headers @{ "User-Agent" = "YouTubeScanner-Watcher" } -TimeoutSec 10
        return $response.commit.sha
    } catch {
        return $null
    }
}

function Run-Build {
    Write-Host "`n[$(Get-Date -Format 'HH:mm:ss')] 변경 감지! 빌드 시작..." -ForegroundColor Cyan
    Set-Location $PROJECT_DIR

    Write-Host "  -> git pull..." -ForegroundColor Gray
    $pullResult = git pull origin main 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [오류] git pull 실패: $pullResult" -ForegroundColor Red
        Show-Notification "빌드 실패" "git pull 오류: $pullResult" "Error"
        return $false
    }
    Write-Host "  -> npm run build..." -ForegroundColor Gray
    $buildResult = npm run build 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [오류] 빌드 실패" -ForegroundColor Red
        Write-Host $buildResult -ForegroundColor Red
        Show-Notification "빌드 실패" "npm run build 오류가 발생했습니다." "Error"
        return $false
    }

    $exePath = Get-ChildItem "$PROJECT_DIR\dist-electron\*.exe" | Select-Object -First 1
    Write-Host "  [완료] 빌드 성공! $($exePath.Name)" -ForegroundColor Green
    Show-Notification "빌드 완료!" "새 버전이 준비됐습니다.`n$($exePath.Name)" "Success"
    return $true
}

# 시작
Clear-Host
Write-Host "================================================" -ForegroundColor Blue
Write-Host "  YouTube Scanner - 자동 감시 & 빌드" -ForegroundColor Blue
Write-Host "================================================" -ForegroundColor Blue
Write-Host "  저장소: $REPO" -ForegroundColor Gray
Write-Host "  브랜치: $BRANCH" -ForegroundColor Gray
Write-Host "  폴더:   $PROJECT_DIR" -ForegroundColor Gray
Write-Host "  간격:   ${CHECK_INTERVAL}초마다 확인" -ForegroundColor Gray
Write-Host "  종료:   Ctrl+C" -ForegroundColor Gray
Write-Host "================================================" -ForegroundColor Blue

# 최초 실행 시 현재 SHA 기록
Write-Host "`n[$(Get-Date -Format 'HH:mm:ss')] 초기 커밋 SHA 확인 중..." -ForegroundColor Yellow
$lastSha = Get-LatestCommitSha
if ($lastSha) {
    Write-Host "  현재: $($lastSha.Substring(0,8))..." -ForegroundColor Gray
} else {
    Write-Host "  [경고] GitHub 연결 실패. 오프라인 상태인지 확인하세요." -ForegroundColor Yellow
}

Write-Host "`n감시 시작! (${CHECK_INTERVAL}초마다 GitHub 확인 중...)" -ForegroundColor Green

while ($true) {
    Start-Sleep -Seconds $CHECK_INTERVAL

    $currentSha = Get-LatestCommitSha
    if (-not $currentSha) {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] 연결 확인 중..." -ForegroundColor Gray
        continue
    }

    if ($lastSha -and $currentSha -ne $lastSha) {
        Write-Host "`n[$(Get-Date -Format 'HH:mm:ss')] 새 커밋: $($currentSha.Substring(0,8))..." -ForegroundColor Yellow
        $success = Run-Build
        if ($success) { $lastSha = $currentSha }
    } else {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] 변경 없음 ($($currentSha.Substring(0,8))...)" -ForegroundColor DarkGray
    }

    if (-not $lastSha) { $lastSha = $currentSha }
}
