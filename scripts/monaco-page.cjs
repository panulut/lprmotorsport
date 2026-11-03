// One HTML shell keeps the practice car controls aligned with the main game.
const excluded=new Set(['analytics.js','leaderboard.js','verified-driving.js','lap-panel.js','championship.js','chat.js','spectate-menu.js','dashboard.js','release-notes.js','client-download.js','shared/track-sync.js','sidebar.js','sale.js']);
function monacoPage(html){
  return html.replace(/<script\b[^>]*src="([^"?]+)(?:\?[^" ]*)?"[^>]*><\/script>/g,(tag,src)=>excluded.has(src)?'':tag)
    .replace(/<title>[^<]*<\/title>/,'<title>Monaco · LPR Motorsport</title>')
    .replace(/connect-src [^;]+;/,"connect-src 'self';")
    .replace(/(<script src="shared\/track-objects.js[^>]*><\/script>)/,'$1\n    <script src="tracks/monaco.js" defer></script>')
    .replace('<script src="game.js','<link rel="stylesheet" href="tracks/monaco.css" />\n    <script src="tracks/monaco-practice.js" defer></script>\n    <script src="game.js')
    .replace('<body>','<body class="monaco-practice">');
}
module.exports={monacoPage};
