// Public endpoints only. Signing secrets belong exclusively on the servers.
window.LPRVerificationConfig = ['localhost','127.0.0.1'].includes(window.location.hostname)
 ? {service:'http://127.0.0.1:8081',leaderboard:'http://127.0.0.1:8788'}
 : {service:'',leaderboard:''};
