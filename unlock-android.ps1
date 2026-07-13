# Tue tous les processus qui verrouillent le dossier android/
Write-Host "→ Arret daemon Gradle..."
$gradlew = "C:\MonPetitRoadtrip\frontend\android\gradlew.bat"
if (Test-Path $gradlew) {
    & $gradlew --stop 2>$null
}

Write-Host "→ Kill java / adb / gradle..."
@("java", "javaw", "adb", "gradle") | ForEach-Object {
    Get-Process -Name $_ -ErrorAction SilentlyContinue | Stop-Process -Force
}

Start-Sleep -Seconds 3

Write-Host "→ Suppression du dossier android..."
$path = "C:\MonPetitRoadtrip\frontend\android"
if (Test-Path $path) {
    Remove-Item -Recurse -Force -Path $path -ErrorAction Stop
    Write-Host "✓ Dossier android supprime"
} else {
    Write-Host "✓ Dossier android inexistant — rien a supprimer"
}
