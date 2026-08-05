# ═══════════════════════════════════════════════════════
#  Cher's Wardrobe — tiny static server.
#  Uses System.Net.HttpListener, which ships with Windows,
#  so there is nothing to install. Serving over http://
#  instead of file:// is what lets the browser keep your
#  closet in IndexedDB between sessions.
# ═══════════════════════════════════════════════════════

param(
  [int]$Port = 8777,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.gif'  = 'image/gif'
  '.svg'  = 'image/svg+xml'
  '.webp' = 'image/webp'
  '.ico'  = 'image/x-icon'
  '.txt'  = 'text/plain; charset=utf-8'
  '.md'   = 'text/plain; charset=utf-8'
  '.onnx' = 'application/octet-stream'
  '.wasm' = 'application/wasm'
  '.mjs'  = 'text/javascript; charset=utf-8'
}

# find a free port if the preferred one is taken
function Test-PortFree([int]$p) {
  $l = New-Object System.Net.HttpListener
  $l.Prefixes.Add("http://localhost:$p/")
  try { $l.Start(); $l.Stop(); $l.Close(); return $true }
  catch { try { $l.Close() } catch {}; return $false }
}

$chosen = $null
foreach ($p in @($Port, 8778, 8779, 8780, 8781, 0)) {
  if ($p -eq 0) { break }
  if (Test-PortFree $p) { $chosen = $p; break }
}
if ($null -eq $chosen) {
  Write-Host ""
  Write-Host "  Could not open a local port (tried $Port-8781)." -ForegroundColor Red
  Write-Host "  Close whatever is using them, or run:  .\serve.ps1 -Port 9001" -ForegroundColor Red
  Write-Host ""
  Read-Host "  Press Enter to close"
  exit 1
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$chosen/")
try {
  $listener.Start()
} catch {
  Write-Host ""
  Write-Host "  Windows refused the port binding: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "  You can still use the app by double-clicking index.html," -ForegroundColor Yellow
  Write-Host "  but your closet may not be remembered between sessions." -ForegroundColor Yellow
  Write-Host ""
  Read-Host "  Press Enter to close"
  exit 1
}

$url = "http://localhost:$chosen/"

Write-Host ""
Write-Host "   +--------------------------------------------+" -ForegroundColor Magenta
Write-Host "   |          C H E R ' S   W A R D R O B E      |" -ForegroundColor Magenta
Write-Host "   +--------------------------------------------+" -ForegroundColor Magenta
Write-Host ""
Write-Host "   Serving : $root"
Write-Host "   Open    : $url" -ForegroundColor Green
Write-Host ""
Write-Host "   Leave this window open while you use the app."
Write-Host "   Press Ctrl+C here when you're done."
Write-Host ""

if (-not $NoBrowser) { Start-Process $url | Out-Null }

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response

    try {
      $rel = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
      if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }
      $rel = $rel -replace '/', '\'

      $full = Join-Path $root $rel
      # keep requests inside the app folder
      $fullResolved = [System.IO.Path]::GetFullPath($full)
      $rootResolved = [System.IO.Path]::GetFullPath($root)

      if (-not $fullResolved.StartsWith($rootResolved, [StringComparison]::OrdinalIgnoreCase)) {
        $res.StatusCode = 403
        $bytes = [Text.Encoding]::UTF8.GetBytes('403 - nope')
      }
      elseif (Test-Path -LiteralPath $fullResolved -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($fullResolved).ToLower()
        $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
        $res.Headers.Add('Cache-Control', 'no-cache')
        # cross-origin isolation lets onnxruntime use SharedArrayBuffer,
        # which is what makes the cutout model run multi-threaded
        $res.Headers.Add('Cross-Origin-Opener-Policy', 'same-origin')
        $res.Headers.Add('Cross-Origin-Embedder-Policy', 'require-corp')
        $res.Headers.Add('Cross-Origin-Resource-Policy', 'same-origin')
        $bytes = [System.IO.File]::ReadAllBytes($fullResolved)
        $res.StatusCode = 200
      }
      else {
        $res.StatusCode = 404
        $res.ContentType = 'text/plain; charset=utf-8'
        $bytes = [Text.Encoding]::UTF8.GetBytes("404 - $rel not found")
      }

      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    }
    catch {
      Write-Host "   ! $($_.Exception.Message)" -ForegroundColor DarkYellow
    }
    finally {
      try { $res.OutputStream.Close() } catch {}
    }
  }
}
finally {
  try { $listener.Stop(); $listener.Close() } catch {}
  Write-Host ""
  Write-Host "   Closet closed." -ForegroundColor Magenta
}
