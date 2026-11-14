// Shared by forge-warm.js and forge-live.js, the two tools that ask the real model: the settings (from .env, read the
// way server.js reads it), the match rules from duel.html, and what a forge is built from.
const fs=require('fs'), path=require('path'), root=path.join(__dirname,'..');
// Load KEY=value lines from the .env file next to server.js (real environment variables win).
try{ for(const line of fs.readFileSync(path.join(root,'.env'),'utf8').split(/\r?\n/)){
  const m=line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i); if(!m||line.trim().startsWith('#')) continue;
  const v=m[2].replace(/^(['"])(.*)\1$/,'$2'); if(v&&process.env[m[1]]===undefined) process.env[m[1]]=v; } }catch(e){}

module.exports=function(tool){
  const KEY=process.env.OPENAI_API_KEY, MODEL=process.env.OPENAI_FORGE_MODEL||process.env.OPENAI_MODEL||'gpt-6-luna';
  const BASE=(process.env.OPENAI_BASE_URL||'https://api.openai.com/v1').replace(/\/$/,'');
  if(!KEY){
    console.error(tool+' asks the real model, and OPENAI_API_KEY is not set.\nPut OPENAI_API_KEY=... in the .env file next to server.js (or in the environment) and run it again.');
    process.exit(1);
  }
  const src=fs.readFileSync(path.join(root,'duel.html'),'utf8').replace(/\r\n/g,'\n');
  const D=new Function(src.split('/*DUEL-START*/')[1].split('/*DUEL-END*/')[0]+';return {createDuel,makeBot,stockItem,STOCK,MOVES,KINDS,ELS,FORGE_API,FORGE_LIMITS};')();
  const Forge=require('../forge.js'), ForgeScript=require('../forgescript.js');
  const file=process.env.FORGE_CACHE===undefined?path.join(root,'forge-cache.json'):process.env.FORGE_CACHE;
  return {D,Forge,ForgeScript,KEY,MODEL,BASE,file};
};
