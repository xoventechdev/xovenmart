<?php
/**
 * cpanel-deploy-webhook.php — deploy trigger for cPanel accounts without SSH.
 *
 * Drop this file at /home/<cpanel-user>/public_html/deploy-api.php and add a
 * CPANEL_DEPLOY_TOKEN GitHub secret matching the value below. The GitHub
 * Actions workflow will POST to this endpoint after a successful upload;
 * the endpoint runs `cpanel-restart.sh` via `shell_exec` and returns the
 * tail of its log so you can see what happened.
 *
 * SECURITY:
 *   - Requires an Authorization: Bearer <CPANEL_DEPLOY_TOKEN> header
 *   - Refuses GET requests (only POST)
 *   - Refuses if token mismatches
 *   - Rate-limited by cPanel's mod_evasive / fail2ban
 *
 * After placing this file, set CPANEL_DEPLOY_TOKEN in your GitHub repo's
 * secrets to the same value you change $TOKEN to here.
 */

// ============================================================================
// CONFIG — change this to a long random string, then mirror in GitHub secret
// ============================================================================
$TOKEN = 'CHANGE_ME_TO_A_LONG_RANDOM_STRING_AT_LEAST_32_CHARS';
$APP_DIR = '/home/YOUR_CPANEL_USER/xovenmart-api';
$SCRIPT  = $APP_DIR . '/apps/api/scripts/cpanel-restart.sh';
$LOG_FILE = $APP_DIR . '/deploy.log';
// ============================================================================

header('Content-Type: text/plain; charset=utf-8');

// Only POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo "Method Not Allowed";
    exit;
}

// Token check
$auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if (!preg_match('/^Bearer\s+(\S+)$/', $auth, $m) || !hash_equals($TOKEN, $m[1])) {
    http_response_code(403);
    echo "Forbidden";
    exit;
}

// Refuse if script missing
if (!is_file($SCRIPT)) {
    http_response_code(500);
    echo "Restart script not found: $SCRIPT\n";
    echo "Make sure you uploaded apps/api/scripts/cpanel-restart.sh\n";
    exit;
}

// Run the restart script with a hard timeout
$cmd = "bash " . escapeshellarg($SCRIPT) . " 2>&1";
$descriptors = [
    0 => ['pipe', 'r'],
    1 => ['pipe', 'w'],
    2 => ['pipe', 'w'],
];
$proc = proc_open($cmd, $descriptors, $pipes, $APP_DIR);
if (!is_resource($proc)) {
    http_response_code(500);
    echo "Failed to start restart script\n";
    exit;
}
fclose($pipes[0]);

// 120s hard timeout (restart script has its own internal smoke test)
$start = time();
$output = '';
stream_set_blocking($pipes[1], false);
stream_set_blocking($pipes[2], false);
while (true) {
    $status = proc_get_status($proc);
    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    if ($stdout !== false) $output .= $stdout;
    if ($stderr !== false) $output .= $stderr;
    if (!$status['running']) break;
    if (time() - $start > 120) {
        proc_terminate($proc, 9);
        echo "TIMEOUT after 120s\nPartial output:\n$output\n";
        exit;
    }
    usleep(200_000);
}
$stdout = stream_get_contents($pipes[1]);
$stderr = stream_get_contents($pipes[2]);
if ($stdout !== false) $output .= $stdout;
if ($stderr !== false) $output .= $stderr;
fclose($pipes[1]);
fclose($pipes[2]);
$exitCode = proc_close($proc);

// Echo the tail of the log file (persistent record) plus the live output
$tail = '';
if (is_file($LOG_FILE)) {
    $tail = "--- $LOG_FILE (last 50 lines) ---\n";
    $tail .= shell_exec("tail -n 50 " . escapeshellarg($LOG_FILE));
}

if ($exitCode === 0) {
    http_response_code(200);
    echo "OK\n\nLive output:\n$output\n\n$tail";
} else {
    http_response_code(500);
    echo "Restart script exited $exitCode\n\nLive output:\n$output\n\n$tail";
}
