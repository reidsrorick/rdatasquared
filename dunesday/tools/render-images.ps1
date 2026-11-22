# Re-renders the link-preview image and app icon from tools/og-card.html using headless Chrome.
# Run from anywhere:  powershell -File tools/render-images.ps1
# Requires Google Chrome and Python with Pillow (for the 180px icon resize).

$root   = Split-Path -Parent $PSScriptRoot
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$prof   = Join-Path $env:TEMP "dunesday-chrome-profile"
$url    = "file:///" + ($root -replace '\\', '/') + "/tools/og-card.html"
$common = @("--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--user-data-dir=`"$prof`"", "--force-device-scale-factor=1", "--virtual-time-budget=6000")

Start-Process -FilePath $chrome -Wait -NoNewWindow -ArgumentList ($common + @("--window-size=1200,630", "--screenshot=`"$root\assets\og-image.png`"", "`"$url`""))
Start-Process -FilePath $chrome -Wait -NoNewWindow -ArgumentList ($common + @("--window-size=512,512", "--screenshot=`"$env:TEMP\dunesday-icon-512.png`"", "`"$url#icon`""))

python -c "from PIL import Image; import sys; src=Image.open(sys.argv[1]).convert('RGB'); src.save(sys.argv[2] + '/icon-512.png'); [src.resize((n,n), Image.LANCZOS).save(sys.argv[2] + '/' + name) for n, name in ((192,'icon-192.png'),(180,'apple-touch-icon.png'))]" "$env:TEMP\dunesday-icon-512.png" "$root\assets"
Write-Host "Done: assets/og-image.png, icon-512.png, icon-192.png, apple-touch-icon.png"
