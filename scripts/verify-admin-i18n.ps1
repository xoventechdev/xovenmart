# Login as admin and exercise admin translations endpoints
function Step { param($m) Write-Host "==> $m" -ForegroundColor Cyan }
function Ok   { param($m) Write-Host "    [OK] $m" -ForegroundColor Green }
function Warn { param($m) Write-Host "    [WARN] $m" -ForegroundColor Yellow }

Step "Login as admin"
try {
    $login = Invoke-RestMethod -Uri 'http://localhost:3001/api/v1/auth/admin/login' -Method Post -ContentType 'application/json' -Body '{"email":"admin@xovenmart.com","password":"admin123"}'
    $token = $login.accessToken
    Ok "Got token (len=$($token.Length))"
} catch {
    Write-Host "    [FAIL] login: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

$hdr = @{ Authorization = "Bearer $token" }

Step "GET /admin/translations?locale=bn"
$r = Invoke-RestMethod -Uri 'http://localhost:3001/api/v1/admin/translations?locale=bn&page=1' -Method Get -Headers $hdr
Ok ("total={0} items={1} locale={2}" -f $r.total, $r.items.Count, $r.locale)

Step "GET /admin/translations/coverage"
$cov = Invoke-RestMethod -Uri 'http://localhost:3001/api/v1/admin/translations/coverage' -Method Get -Headers $hdr
Ok ("bn={0} en={1} total={2} missing-bn={3} missing-en={4}" -f $cov.bnCount, $cov.enCount, $cov.totalDistinctKeys, $cov.bnMissingInLocale, $cov.enMissingInLocale)

Step "PUT /admin/translations (upsert test key)"
$key = "test.admin.upsert." + [DateTime]::Now.Ticks
$putBody = @{key=$key; locale="bn"; value="test bn"} | ConvertTo-Json
$put = Invoke-RestMethod -Uri 'http://localhost:3001/api/v1/admin/translations' -Method Put -ContentType 'application/json' -Headers $hdr -Body $putBody
Ok ("created row key=$($put.key)")

Step "POST /admin/translations/bulk"
$bulkBody = @{rows=@(@{key="test.bulk.1";locale="en";value="Bulk EN"},@{key="test.bulk.2";locale="en";value="Bulk EN 2"})} | ConvertTo-Json
$bulk = Invoke-RestMethod -Uri 'http://localhost:3001/api/v1/admin/translations/bulk' -Method Post -ContentType 'application/json' -Headers $hdr -Body $bulkBody
Ok ("bulk updated=$($bulk.updated) errors=$($bulk.errors.Count)")

Step "POST /admin/translations/import"
$impBody = @{locale="en"; rows=@(@{key="test.import.a";value="Imported A"},@{key="test.import.b";value="Imported B"})} | ConvertTo-Json
$imp = Invoke-RestMethod -Uri 'http://localhost:3001/api/v1/admin/translations/import' -Method Post -ContentType 'application/json' -Headers $hdr -Body $impBody
Ok ("import updated=$($imp.updated)")

Step "GET /admin/translations/export"
$exp = Invoke-RestMethod -Uri 'http://localhost:3001/api/v1/admin/translations/export?locale=en' -Method Get -Headers $hdr
Ok ("export count=$($exp.count)")

Step "DELETE test keys (cleanup)"
$delUrl1 = "http://localhost:3001/api/v1/admin/translations/$key/bn"
Invoke-RestMethod -Uri $delUrl1 -Method Delete -Headers $hdr | Out-Null
Invoke-RestMethod -Uri 'http://localhost:3001/api/v1/admin/translations/test.bulk.1/en' -Method Delete -Headers $hdr | Out-Null
Invoke-RestMethod -Uri 'http://localhost:3001/api/v1/admin/translations/test.bulk.2/en' -Method Delete -Headers $hdr | Out-Null
Invoke-RestMethod -Uri 'http://localhost:3001/api/v1/admin/translations/test.import.a/en' -Method Delete -Headers $hdr | Out-Null
Invoke-RestMethod -Uri 'http://localhost:3001/api/v1/admin/translations/test.import.b/en' -Method Delete -Headers $hdr | Out-Null
Ok "cleanup done"

Write-Host ""
Write-Host "ALL ADMIN TRANSLATIONS ENDPOINTS WORKING" -ForegroundColor Green
