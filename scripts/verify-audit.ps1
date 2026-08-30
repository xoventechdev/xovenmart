$login = Invoke-RestMethod -Uri 'http://localhost:3001/api/v1/auth/admin/login' -Method Post -ContentType 'application/json' -Body '{"email":"admin@xovenmart.com","password":"admin123"}'
$token = $login.accessToken
$hdr = @{ Authorization = "Bearer $token" }

# Recent translation audit entries
$audit = Invoke-RestMethod -Uri 'http://localhost:3001/api/v1/admin/audit/logs?entity=translation&limit=10' -Method Get -Headers $hdr

Write-Host "Last translation audit entries:" -ForegroundColor Cyan
foreach ($e in $audit.items) {
    Write-Host ("  {0:yyyy-MM-dd HH:mm:ss} {1} {2} by {3}" -f $e.createdAt, $e.action, $e.entityId, $e.actorId) -ForegroundColor Yellow
}
Write-Host ("Total: {0}" -f $audit.items.Count) -ForegroundColor Green
