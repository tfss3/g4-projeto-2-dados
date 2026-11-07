import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const host='127.0.0.1', port=Number(process.argv[2] || 8090);
const types={
  'index.html':'text/html; charset=utf-8',
  'styles.css':'text/css; charset=utf-8',
  'app.js':'text/javascript; charset=utf-8',
  'model.mjs':'text/javascript; charset=utf-8',
  'territorios.json':'application/json; charset=utf-8',
  'favicon.svg':'image/svg+xml',
  'logo-argos-clean.png':'image/png'
};
createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const name=pathname==='/'?'index.html':pathname.slice(1);
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
  if(!Object.hasOwn(types,name)){res.writeHead(404).end();return;}
  try {
    const body=await readFile(new URL('./'+name,import.meta.url));
    res.writeHead(200,{'Content-Type':types[name],'Content-Length':body.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:body);
  } catch {res.writeHead(500).end('Falha ao ler arquivo do protótipo.');}
}).listen(port,host,()=>console.log('ARGOS disponível em http://'+host+':'+port));
