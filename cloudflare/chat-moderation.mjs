import {admin} from './replays.mjs';
import {validPlayer} from '../verification/protocol.mjs';
// Messages keep their author only server-side, so an admin can remove a message,
// block its author and close guest chat without exposing identities publicly.
export const chatModerationSchema=[
 'CREATE TABLE IF NOT EXISTS verified_chat_authors (id TEXT PRIMARY KEY,player_hash TEXT NOT NULL,at INTEGER NOT NULL)',
 'CREATE INDEX IF NOT EXISTS verified_chat_author_player ON verified_chat_authors(player_hash)',
 'CREATE TABLE IF NOT EXISTS verified_chat_blocks (player_hash TEXT PRIMARY KEY,nickname TEXT NOT NULL,created_ms INTEGER NOT NULL)',
 'CREATE TABLE IF NOT EXISTS verified_chat_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL)'
];
const CHAT_MESSAGE_ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
// Checked when a chat ticket is issued and again when a message is stored, so a block
// or a closed guest chat also stops tickets that were issued before it.
export async function chatRefusal(db,playerHash,guest){
 if(playerHash&&await db.prepare('SELECT 1 FROM verified_chat_blocks WHERE player_hash=?').bind(playerHash).first())
  return {error:'Chat blocked',code:'chat_blocked'};
 if(guest&&(await db.prepare("SELECT value FROM verified_chat_settings WHERE key='guests'").first())?.value==='off')
  return {error:'Guest chat is closed',code:'chat_guests_closed'};
 return null;
}
export const orphanChatAuthors=db=>db.prepare('DELETE FROM verified_chat_authors WHERE id NOT IN (SELECT id FROM verified_chat_messages)');
export async function chatAdminRoute(request,env,url,reply,retentionMs){
 if(!await admin(request,env))return reply({error:'Unauthorized'},401);
 const db=env.DB,now=Date.now();
 if(request.method==='GET'){
  const [messages,blocks,guests]=await Promise.all([
   db.prepare(`SELECT m.id,m.nickname,m.text,m.at,a.player_hash,b.player_hash IS NOT NULL AS blocked
    FROM verified_chat_messages m LEFT JOIN verified_chat_authors a ON a.id=m.id LEFT JOIN verified_chat_blocks b ON b.player_hash=a.player_hash
    WHERE m.at>? ORDER BY m.at DESC,m.id DESC LIMIT 100`).bind(now-retentionMs).all(),
   db.prepare('SELECT player_hash,nickname,created_ms FROM verified_chat_blocks ORDER BY created_ms DESC LIMIT 200').all(),
   db.prepare("SELECT value FROM verified_chat_settings WHERE key='guests'").first()
  ]);
  return reply({messages:messages.results.map(row=>({...row,blocked:!!row.blocked})),blocks:blocks.results,guestsOpen:guests?.value!=='off'});
 }
 if(request.method!=='POST')return reply({error:'Method not allowed'},405);
 const remove=url.searchParams.get('delete'),block=url.searchParams.get('block'),unblock=url.searchParams.get('unblock'),guests=url.searchParams.get('guests');
 if(remove!==null){
  if(!CHAT_MESSAGE_ID.test(remove))return reply({error:'Invalid message'},400);
  await db.batch([db.prepare('DELETE FROM verified_chat_messages WHERE id=?').bind(remove),db.prepare('DELETE FROM verified_chat_authors WHERE id=?').bind(remove)]);
  return reply({deleted:true});
 }
 if(block!==null){
  // Block the author of one message and remove everything they still have in the room.
  if(!CHAT_MESSAGE_ID.test(block))return reply({error:'Invalid message'},400);
  const author=await db.prepare('SELECT a.player_hash,m.nickname FROM verified_chat_authors a JOIN verified_chat_messages m ON m.id=a.id WHERE a.id=?').bind(block).first();
  if(!author)return reply({error:'Message author unknown'},404);
  await db.batch([
   db.prepare('INSERT OR REPLACE INTO verified_chat_blocks(player_hash,nickname,created_ms) VALUES (?,?,?)').bind(author.player_hash,author.nickname,now),
   db.prepare('DELETE FROM verified_chat_messages WHERE id IN (SELECT id FROM verified_chat_authors WHERE player_hash=?)').bind(author.player_hash),
   db.prepare('DELETE FROM verified_chat_authors WHERE player_hash=?').bind(author.player_hash)
  ]);
  return reply({blocked:true});
 }
 if(unblock!==null){
  if(!validPlayer(unblock))return reply({error:'Invalid player'},400);
  await db.prepare('DELETE FROM verified_chat_blocks WHERE player_hash=?').bind(unblock).run();
  return reply({unblocked:true});
 }
 if(guests==='on'||guests==='off'){
  await db.prepare("INSERT INTO verified_chat_settings(key,value) VALUES ('guests',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(guests).run();
  return reply({guestsOpen:guests==='on'});
 }
 return reply({error:'Unknown action'},400);
}
