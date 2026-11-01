import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {Engine} from './lib/engine.mjs';
import {json} from './lib/rpc.mjs';
await mkdir(new URL('./var/',import.meta.url),{recursive:true});
const root=fileURLToPath(new URL('./public/',import.meta.url)),port=Number(process.env.PORT||4381),engine=await new Engine().init();
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1:'+port);res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');if(req.method==='GET'&&url.pathname==='/api/state'){res.setHeader('Content-Type','application/json; charset=utf-8');res.end(json(engine.snapshot()));return;}
 if(req.method==='POST'&&url.pathname==='/api/refresh'){if(req.headers.origin!=='http://127.0.0.1:'+port&&req.headers.origin!=='http://localhost:'+port){res.writeHead(403);res.end('Local page only');return;}void engine.refresh();res.setHeader('Content-Type','application/json');res.end('{"refreshing":true}');return;}
 if(req.method!=='GET'){res.writeHead(405);res.end('Read-only monitor');return;}
 const requested=url.pathname==='/'?'index.html':url.pathname.slice(1),target=path.resolve(root,requested);if(!target.startsWith(root)){res.writeHead(403);res.end();return;}const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'}[path.extname(target)];if(!mime){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',mime);res.end(await readFile(target));
 }catch(error){res.writeHead(500,{'Content-Type':'application/json'});res.end(json({error:error.message}));}});
server.listen(port,'127.0.0.1',()=>console.log('Aero monitor: http://127.0.0.1:'+port));
process.on('SIGTERM',()=>{engine.close();server.close(()=>process.exit());});process.on('SIGINT',()=>{engine.close();server.close(()=>process.exit());});
