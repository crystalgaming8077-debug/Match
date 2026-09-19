const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const HTML = path.join(ROOT, 'AKTan_Tournament_PointCalc_AKTAN_V25_PUBLIC_SPECTATOR.html');
const DATA_FILE = path.join(ROOT, 'public-data.json');
const VERSION = '26.4.0-room-teams-leaderboard';

let pg = null;
let db = { publications: {} };

function loadLocalDB(){
  try { return JSON.parse(fs.readFileSync(DATA_FILE,'utf8')); }
  catch { return {publications:{}}; }
}
function saveLocalDB(){ try { fs.writeFileSync(DATA_FILE, JSON.stringify(db,null,2)); } catch(e) { console.error('Local DB save failed:',e.message); } }
function json(res,status,data){
  const body=JSON.stringify(data);
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, X-Admin-Key','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Cache-Control':'no-store'});
  res.end(body);
}
function readBody(req){return new Promise((resolve,reject)=>{let b='';req.on('data',c=>{b+=c;if(b.length>8e6)req.destroy();});req.on('end',()=>{try{resolve(b?JSON.parse(b):{})}catch(e){reject(e)}});req.on('error',reject)})}
function safeState(s){ if(!s || typeof s!=='object') return null; const x=JSON.parse(JSON.stringify(s)); delete x.adminPin; delete x.publicMode; delete x._aktanAdminPasswordHash; return x; }
function passwordHash(v){ return crypto.createHash('sha256').update(String(v||'')).digest('hex'); }
function publicState(pub){ const x=JSON.parse(JSON.stringify(pub.state||{})); delete x._aktanAdminPasswordHash; return x; }
function auth(pub,req){return String(req.headers['x-admin-key']||'')===pub.adminKey}
function clean(v,max=60){return String(v||'').trim().slice(0,max)}
function makeToken(){return crypto.randomBytes(18).toString('base64url')}
function makeKey(){return crypto.randomBytes(24).toString('base64url')}
function origin(req){const proto=(req.headers['x-forwarded-proto']||'http').split(',')[0];const host=req.headers['x-forwarded-host']||req.headers.host||`localhost:${PORT}`;return `${proto}://${host}`;}

async function initStore(){
  if(process.env.DATABASE_URL){
    try{
      const { Pool } = require('pg');
      pg = new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},max:5,idleTimeoutMillis:30000,connectionTimeoutMillis:10000});
      await pg.query(`CREATE TABLE IF NOT EXISTS aktan_publications (
        token TEXT PRIMARY KEY,
        admin_key TEXT NOT NULL,
        state JSONB NOT NULL,
        registrations JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at BIGINT NOT NULL
      )`);
      const test=await pg.query('SELECT COUNT(*)::int AS n FROM aktan_publications');
      console.log('PostgreSQL connected. Publications:',test.rows[0].n);
      // One-time migration from an existing local public-data.json, only when the PG table is empty.
      const local=loadLocalDB();
      if(Object.keys(local.publications||{}).length && Number(test.rows[0].n)===0){
        for(const pub of Object.values(local.publications)){
          await pg.query('INSERT INTO aktan_publications(token,admin_key,state,registrations,updated_at) VALUES($1,$2,$3::jsonb,$4::jsonb,$5) ON CONFLICT(token) DO NOTHING',[pub.token,pub.adminKey,JSON.stringify(pub.state||{}),JSON.stringify(pub.registrations||[]),Number(pub.updatedAt||Date.now())]);
        }
        console.log('Migrated local public-data.json to PostgreSQL.');
      }
      return;
    }catch(e){ console.error('PostgreSQL connection failed:',e.message); pg=null; }
  }
  db=loadLocalDB();
  console.log('Using local JSON fallback storage.');
}

async function getPub(token){
  if(pg){const r=await pg.query('SELECT token,admin_key,state,registrations,updated_at FROM aktan_publications WHERE token=$1',[token]); if(!r.rowCount)return null; const x=r.rows[0]; return {token:x.token,adminKey:x.admin_key,state:x.state,registrations:Array.isArray(x.registrations)?x.registrations:[],updatedAt:Number(x.updated_at)};}
  return db.publications[token]||null;
}
async function createPub(pub){
  if(pg){await pg.query('INSERT INTO aktan_publications(token,admin_key,state,registrations,updated_at) VALUES($1,$2,$3::jsonb,$4::jsonb,$5)',[pub.token,pub.adminKey,JSON.stringify(pub.state),JSON.stringify(pub.registrations),pub.updatedAt]);}
  else {db.publications[pub.token]=pub;saveLocalDB();}
}
async function updatePub(pub){
  if(pg){await pg.query('UPDATE aktan_publications SET state=$2::jsonb,registrations=$3::jsonb,updated_at=$4 WHERE token=$1',[pub.token,JSON.stringify(pub.state),JSON.stringify(pub.registrations),pub.updatedAt]);}
  else {db.publications[pub.token]=pub;saveLocalDB();}
}
async function countPubs(){if(pg){const r=await pg.query('SELECT COUNT(*)::int AS n FROM aktan_publications');return r.rows[0].n;}return Object.keys(db.publications).length;}

const server=http.createServer(async (req,res)=>{
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, X-Admin-Key','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS'});return res.end()}
  const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  try{
    if(req.method==='POST' && u.pathname==='/api/public/create'){
      const b=await readBody(req);const state=safeState(b.state);if(!state)return json(res,400,{error:'Invalid tournament state'});
      const token=makeToken(),adminKey=makeKey(),pub={token,adminKey,state,registrations:[],updatedAt:Date.now()}; if(b.state&&b.state.adminPin)pub.state._aktanAdminPasswordHash=passwordHash(b.state.adminPin);
      await createPub(pub); return json(res,200,{token,adminKey,url:origin(req)+'/?publicToken='+encodeURIComponent(token)});
    }
    let m=u.pathname.match(/^\/api\/public\/([^/]+)\/state$/);
    if(m){const pub=await getPub(m[1]);if(!pub)return json(res,404,{error:'Public tournament not found'});
      if(req.method==='GET')return json(res,200,{state:publicState(pub),updatedAt:pub.updatedAt});
      if(req.method==='PUT'){if(!auth(pub,req))return json(res,403,{error:'Invalid admin key'});const b=await readBody(req),state=safeState(b.state);if(!state)return json(res,400,{error:'Invalid state'});if(b.adminPassword!==undefined&&String(b.adminPassword).length)state._aktanAdminPasswordHash=passwordHash(b.adminPassword);else if(pub.state&&pub.state._aktanAdminPasswordHash)state._aktanAdminPasswordHash=pub.state._aktanAdminPasswordHash;pub.state=state;pub.updatedAt=Date.now();await updatePub(pub);return json(res,200,{ok:true,updatedAt:pub.updatedAt});}
    }
    m=u.pathname.match(/^\/api\/public\/([^/]+)\/admin-login$/);
    if(m && req.method==='POST'){const pub=await getPub(m[1]);if(!pub)return json(res,404,{error:'Public tournament not found'});const b=await readBody(req);const hash=pub.state&&pub.state._aktanAdminPasswordHash;if(!hash)return json(res,403,{error:'Admin password is not configured. Open the main app, set an Admin PIN, then Publish / Sync.'});if(passwordHash(b.password)!==hash)return json(res,403,{error:'Invalid admin password'});return json(res,200,{ok:true,adminKey:pub.adminKey,state:publicState(pub),updatedAt:pub.updatedAt});}
    m=u.pathname.match(/^\/api\/public\/([^/]+)\/register$/);
    if(m && req.method==='POST'){
      const pub=await getPub(m[1]);if(!pub)return json(res,404,{error:'Public tournament not found'});const b=await readBody(req);
      const cfg=Object.assign({mode:'squad',logo:true,team:true,players:true,phone:true},pub.state.publicRegistration||{});
      const contestId=clean(b.contestId,80);
      const contests=Array.isArray(pub.state.publicContests)?pub.state.publicContests:[];
      const contest=contestId?contests.find(x=>String(x.id)===contestId):null;
      if(contests.length && !contest)return json(res,400,{error:'Please select a valid contest / room'});
      if(contest){const max=Math.max(1,Math.min(1000,+contest.maxSlots||1));const approved=(pub.state.teams||[]).filter(t=>String(t.contestId||'')===contestId).length;const pending=pub.registrations.filter(r=>String(r.contestId||'')===contestId).length;if(approved+pending>=max)return json(res,409,{error:'This room is full. Please choose another room'});}
      const rawFmt=String(contest?.format||'').trim().toLowerCase().replace(/\s+/g,'');
      const fmt=rawFmt.replace(/[^a-z0-9v\/]/g,'');
      const team=clean(b.team,40),captain=clean(b.captain,40),phone=clean(b.phone,20),logo=typeof b.logo==='string'&&b.logo.startsWith('data:image/')?b.logo.slice(0,1500000):'',players=Array.isArray(b.players)?b.players.slice(0,5).map(x=>clean(x,40)):[];
      // Accept exact formats (1v1/2v2/3v3/4v4) and combined labels such as CS Headshot 1v1/2v2.
      const counts=[1,2,3,4].filter(n=>new RegExp('(?:^|\/)'+n+'v'+n+'(?:$|\/)').test(fmt)||fmt===n+'v'+n);
      const fallbackMode=String(b.mode||cfg.mode||'squad').toLowerCase();
      const submittedCount=players.filter(Boolean).length;
      let need=counts.length?(counts.includes(submittedCount)?submittedCount:counts[0]):(fallbackMode==='solo'?1:fallbackMode==='duo'?2:4);
      // For a combined format, allow the public form to submit whichever supported player count it displays.
      if(counts.length && !counts.includes(submittedCount))return json(res,400,{error:'This room accepts '+counts.map(n=>n+'v'+n).join(' or ')+'. Please fill the correct number of players.'});
      const mode=need===1?'solo':need===2?'duo':'squad';
      const needsTeam=true; // V26.3: every room registration must carry an explicit Team Name.
      const needsLogo=false;
      const needsPhone=true;
      if((needsTeam&&!team)||(needsPhone&&!phone)||submittedCount!==need||players.slice(0,need).some(x=>!x))return json(res,400,{error:'Please fill Team Name, all required player names and phone number for this room.'});
      const identity=(team||players[0]).toLowerCase();
      const exists=(pub.state.teams||[]).some(t=>String(t.name||'').trim().toLowerCase()===identity)||pub.registrations.some(r=>String(r.team||r.players?.[0]||'').toLowerCase()===identity);
      if(exists)return json(res,409,{error:'This team/player name is already registered or pending'});
      const r={id:makeToken(),contestId,contestTitle:contest?.title||'',mode,team,captain:captain||players[0],players,phone,logo,createdAt:Date.now()};pub.registrations.push(r);pub.updatedAt=Date.now();await updatePub(pub);return json(res,201,{ok:true,id:r.id});
    }
    m=u.pathname.match(/^\/api\/admin\/([^/]+)\/registrations$/);
    if(m && req.method==='GET'){const pub=await getPub(m[1]);if(!pub)return json(res,404,{error:'Public tournament not found'});if(!auth(pub,req))return json(res,403,{error:'Invalid admin key'});return json(res,200,{registrations:pub.registrations});}
    m=u.pathname.match(/^\/api\/admin\/([^/]+)\/registrations\/([^/]+)$/);
    if(m && req.method==='DELETE'){const pub=await getPub(m[1]);if(!pub)return json(res,404,{error:'Public tournament not found'});if(!auth(pub,req))return json(res,403,{error:'Invalid admin key'});const i=pub.registrations.findIndex(r=>r.id===m[2]);if(i<0)return json(res,404,{error:'Registration not found'});const r=pub.registrations.splice(i,1)[0];pub.updatedAt=Date.now();await updatePub(pub);return json(res,200,{registration:r});}

    if(req.method==='GET' && u.pathname==='/'){const file=u.searchParams.has('publicToken')?HTML:path.join(ROOT,'index.html');const html=fs.readFileSync(file);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(html);}
    if(req.method==='GET' && u.pathname==='/index.html'){const html=fs.readFileSync(path.join(ROOT,'index.html'));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(html);}
    if(req.method==='GET' && u.pathname==='/health')return json(res,200,{ok:true,publications:await countPubs(),persistentStore:!!pg,version:VERSION});
    res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');
  }catch(e){console.error(e);json(res,500,{error:'Server error: '+e.message})}
});

initStore().then(()=>server.listen(PORT,HOST,()=>console.log(`AKTan Public Server running on http://${HOST}:${PORT} (${VERSION})`))).catch(e=>{console.error('Startup failed:',e);process.exit(1)});
