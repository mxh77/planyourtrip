# Script PowerShell pour récupérer les logs du serveur backend

param(
    [string]$BackendUrl = "http://localhost:3111"
)

Write-Host "📋 Récupération des logs depuis $BackendUrl..." -ForegroundColor Cyan
Write-Host ""

try {
    # Télécharger les logs
    $response = Invoke-WebRequest -Uri "$BackendUrl/api/debug/logs" -UseBasicParsing
    $logs = $response.Content
    
    # Sauvegarder dans un fichier
    $logFile = "backend-logs.txt"
    $logs | Out-File -FilePath $logFile -Encoding UTF8
    
    Write-Host "✅ Logs sauvegardés dans: $logFile" -ForegroundColor Green
    Write-Host ""
    Write-Host "--- Aperçu des 50 dernières lignes ---" -ForegroundColor Yellow
    
    # Afficher les 50 dernières lignes
    $lines = $logs -split "`n"
    $lines[([Math]::Max(0, $lines.Length - 50))..($lines.Length - 1)] | ForEach-Object { Write-Host $_ }
    
} catch {
    Write-Host "❌ Erreur lors de la récupération des logs: $_" -ForegroundColor Red
    exit 1
}
