const { spawn } = require('child_process');
const p = spawn('npx', ['@playwright/mcp@latest'], { stdio: ['pipe','pipe','pipe'], shell: true });
let buf = '';
const send = (o) => p.stdin.write(JSON.stringify(o) + '\n');
p.stdout.on('data', d => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    let m; try { m = JSON.parse(line); } catch { continue; }
    if (m.id === 1) { send({ jsonrpc:'2.0', method:'notifications/initialized' }); send({ jsonrpc:'2.0', id:2, method:'tools/list', params:{} }); }
    if (m.id === 2) { console.log((m.result.tools||[]).map(t => t.name).join('\n')); p.kill(); process.exit(0); }
  }
});
send({ jsonrpc:'2.0', id:1, method:'initialize', params:{ protocolVersion:'2024-11-05', capabilities:{}, clientInfo:{ name:'probe', version:'1' } } });
setTimeout(() => { console.error('timeout'); p.kill(); process.exit(1); }, 100000);
