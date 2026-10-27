// Unit/regression tests must never inherit the developer's private Atlas connection.
// Live integration is explicitly opt-in through the separate verification scripts.
const { spawn } = require('node:child_process');
const path = require('node:path');
const child = spawn(process.execPath, ['--test', ...process.argv.slice(2)], {
  cwd: path.resolve(__dirname, '..'), stdio: 'inherit', windowsHide: true,
  env: { ...process.env, MONGODB_URI: '', MAPBOX_ACCESS_TOKEN: '', MAPBOX_GEOCODING_PERMANENT: 'false', RESEND_API_KEY:'', AUTH_EMAIL_FROM:'', AUTH_PUBLIC_APP_URL:'', NODE_ENV: 'test', PROJ_NETWORK: 'OFF' },
});
child.once('error', () => { process.exitCode = 1; });
child.once('exit', (code, signal) => { process.exitCode = signal ? 1 : code ?? 1; });
