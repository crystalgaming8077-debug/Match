const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const HTML = path.join(ROOT, 'AKTan_Tournament_PointCalc_AKTAN_V25_PUBLIC_SPECTATOR.html');
const DATA_FILE = path.join(ROOT, 'public-data.json');

function loadDB(){
  try { return JSON.parse(fs.readFileSync(DATA_FILE,'utf8')); }
  catch { return {publications:{}}; }
}
let db = loadDB();
function saveDB(){ fs.writeFileSync(DATA_FILE, JSON.stringify(db,null,2)); }
function json(res,status,data){
  const body=JSON.stringify(data);
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, X-Admin-Key','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Cache-Control':'no-store'});
  res.end(body);
}
function readBody(req){return new Promise((resolve,reject)=>{let b='';req.on('data',c=>{b+=c;if(b.length>8e6)req.destroy();});req.on('end',()=>{try{resolve(b?JSON.parse(b):{})}catch(e){reject(e)}});req.on('error',reject)})}
function safeState(s){
  if(!s || typeof s!=='object') return null;
  const x=JSON.parse(JSON.stringify(s));
  delete x.adminPin; delete x.publicMode;
  return x;
}
function auth(pub,req){return String(req.headers['x-admin-key']||'')===pub.adminKey}
function clean(v,max=60){return String(v||'').trim().slice(0,max)}
function makeToken(){return crypto.randomBytes(18).toString('base64url')}
function makeKey(){return crypto.randomBytes(24).toString('base64url')}
function origin(req){
  const proto=(req.headers['x-forwarded-proto']||'http').split(',')[0];
  const host=req.headers['x-forwarded-host']||req.headers.host||`localhost:${PORT}`;
  return `${proto}://${host}`;
}

const server=http.createServer(async (req,res)=>{
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, X-Admin-Key','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS'});return res.end()}
  const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  try{
    if(req.method==='POST' && u.pathname==='/api/public/create'){
      const b=await readBody(req);const state=safeState(b.state);if(!state)return json(res,400,{error:'Invalid tournament state'});
      const token=makeToken(),adminKey=makeKey();
      db.publications[token]={token,adminKey,state,registrations:[],updatedAt:Date.now()};saveDB();
      return json(res,200,{token,adminKey,url:origin(req)+'/?publicToken='+encodeURIComponent(token)});
    }
    let m=u.pathname.match(/^\/api\/public\/([^/]+)\/state$/);
    if(m){const pub=db.publications[m[1]];if(!pub)return json(res,404,{error:'Public tournament not found'});
      if(req.method==='GET')return json(res,200,{state:pub.state,updatedAt:pub.updatedAt});
      if(req.method==='PUT'){if(!auth(pub,req))return json(res,403,{error:'Invalid admin key'});const b=await readBody(req),state=safeState(b.state);if(!state)return json(res,400,{error:'Invalid state'});pub.state=state;pub.updatedAt=Date.now();saveDB();return json(res,200,{ok:true,updatedAt:pub.updatedAt});}
    }
    m=u.pathname.match(/^\/api\/public\/([^/]+)\/register$/);
    if(m && req.method==='POST'){
      const pub=db.publications[m[1]];if(!pub)return json(res,404,{error:'Public tournament not found'});const b=await readBody(req);
      const mode=['solo','duo','squad'].includes(String(b.mode||'').toLowerCase())?String(b.mode).toLowerCase():'squad';
      const team=clean(b.team,40),captain=clean(b.captain,40),phone=clean(b.phone,20),logo=String(b.logo||'').slice(0,3000000),players=Array.isArray(b.players)?b.players.slice(0,5).map(x=>clean(x,40)):[];
      const required=mode==='solo'?1:mode==='duo'?2:4;
      if(!phone||!logo||players.length<required||players.slice(0,required).some(x=>!x)||(mode!=='solo'&&!team)||(mode==='squad'&&!captain))return json(res,400,{error:'Please provide the required fields for '+mode.toUpperCase()});
      if(!/^data:image\/(png|jpeg|webp);base64,/i.test(logo))return json(res,400,{error:'Invalid logo image'});
      const keyName=mode==='solo'?players[0]:team;
      const exists=(pub.state.teams||[]).some(t=>String(t.name||'').trim().toLowerCase()===keyName.toLowerCase()) || pub.registrations.some(r=>String(r.team||'').toLowerCase()===keyName.toLowerCase());
      if(exists)return json(res,409,{error:'This team/player name is already registered or pending'});
      const r={id:makeToken(),mode,team:keyName,captain:mode==='squad'?captain:players[0],players,phone,logo,createdAt:Date.now()};pub.registrations.push(r);saveDB();return json(res,201,{ok:true,id:r.id});
    }
    m=u.pathname.match(/^\/api\/admin\/([^/]+)\/registrations$/);
    if(m && req.method==='GET'){const pub=db.publications[m[1]];if(!pub)return json(res,404,{error:'Public tournament not found'});if(!auth(pub,req))return json(res,403,{error:'Invalid admin key'});return json(res,200,{registrations:pub.registrations});}
    m=u.pathname.match(/^\/api\/admin\/([^/]+)\/registrations\/([^/]+)$/);
    if(m && req.method==='DELETE'){const pub=db.publications[m[1]];if(!pub)return json(res,404,{error:'Public tournament not found'});if(!auth(pub,req))return json(res,403,{error:'Invalid admin key'});const i=pub.registrations.findIndex(r=>r.id===m[2]);if(i<0)return json(res,404,{error:'Registration not found'});const r=pub.registrations.splice(i,1)[0];saveDB();return json(res,200,{registration:r});}

    // Serve the app for root and public links.
    if(req.method==='GET' && (u.pathname==='/' || u.pathname==='/index.html')){
      const html=fs.readFileSync(HTML);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(html);
    }
    if(req.method==='GET' && u.pathname==='/health')return json(res,200,{ok:true,publications:Object.keys(db.publications).length});
    res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');
  }catch(e){console.error(e);json(res,500,{error:'Server error: '+e.message})}
});
server.listen(PORT,HOST,()=>console.log(`AKTan Public Server running on http://localhost:${PORT}`));
