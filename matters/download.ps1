# Downloads the public RECAP PDFs listed in <matter>\manifest.csv (columns: role,file,url) into <matter>\raw\
param([string]$Matter)
$dir = Join-Path $PSScriptRoot $Matter
New-Item -ItemType Directory -Force -Path (Join-Path $dir "raw") | Out-Null
Import-Csv (Join-Path $dir "manifest.csv") | ForEach-Object {
  $out = Join-Path $dir ("raw\" + $_.file)
  if (-not (Test-Path $out)) { Invoke-WebRequest -UseBasicParsing -Uri $_.url -OutFile $out; Start-Sleep -Milliseconds 500 }
  "{0,-12} {1,-40} {2,8:N0} KB" -f $_.role, $_.file, ((Get-Item $out).Length / 1KB)
}
