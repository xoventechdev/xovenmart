// Tiny probe to test the local Next.js dev server (avoids sandbox curl).
const http = require('http');
const url = process.argv[2] || 'http://127.0.0.1:3000/';

http.get(url, (res) => {
  let body = '';
  res.on('data', (c) => { body += c; });
  res.on('end', () => {
    console.log(`HTTP ${res.statusCode} | content-type=${res.headers['content-type']} | bytes=${body.length}`);
    console.log('--- first 500 chars of HTML ---');
    console.log(body.slice(0, 500));
    if (body.includes('XovenMart') || body.includes('xovenmart')) {
      console.log('--- HTML contains "XovenMart" ---');
    }
    if (res.statusCode >= 400) {
      console.log('--- ERR tail ---');
      console.log(body.slice(-500));
    }
  });
}).on('error', (e) => {
  console.error('PROBE FAILED:', e.message);
  process.exit(1);
});
