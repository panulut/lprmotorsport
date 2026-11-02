// Public endpoints only. Signing secrets belong exclusively on the servers.
const loopback = ['localhost','127.0.0.1','[::1]'].includes(window.location.hostname);
// Demo data is opt-in and can never be enabled on a public deployment.
const localDemo = loopback && new URLSearchParams(window.location.search || '').get('demo') === '1';
window.LPRVerificationConfig = localDemo
 ? {service:window.location.origin,leaderboard:window.location.origin,mode:'local-demo',demo:true}
 : loopback
  ? {service:'http://127.0.0.1:8081',leaderboard:'http://127.0.0.1:8788',mode:'local'}
  : {service:'https://lpr-verification.onrender.com',leaderboard:'https://lpr-verified.panu-musakka.workers.dev',mode:'production'};
