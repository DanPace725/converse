import {createHmac,timingSafeEqual,createHash} from 'node:crypto';
export function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
const secret=()=>process.env.APP_PASSWORD;
export function equal(a,b){return timingSafeEqual(createHash('sha256').update(String(a)).digest(),createHash('sha256').update(String(b)).digest());}
function sign(value){return createHmac('sha256',secret()).update(value).digest('hex');}
export function session(){const expires=String(Date.now()+7*86400000);return expires+'.'+sign(expires);}
export function guard(req,res){
 if(req.headers.origin&&req.headers.origin!==`${process.env.VERCEL?'https':'http'}://${req.headers.host}`){json(res,403,{error:'Origin not allowed'});return false;}
 if(!secret()){if(!process.env.VERCEL)return true;json(res,503,{error:'Set APP_PASSWORD in Vercel environment variables.'});return false;}
 const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('converse_session='))?.slice(17)||'';
 const [expires,signature]=token.split('.');
 if(!expires||!signature||Number(expires)<Date.now()||!equal(signature,sign(expires))){json(res,401,{error:'Unlock Converse to continue.'});return false;}return true;
}
export async function body(req){if(!req.headers['content-type']?.startsWith('application/json'))throw Error('JSON required');if(req.body){const value=typeof req.body==='string'?JSON.parse(req.body):req.body;if(JSON.stringify(value).length>1000000)throw Error('Chat is too large.');return value;}let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1000000)throw Error('Chat is too large.');}return JSON.parse(raw);}
