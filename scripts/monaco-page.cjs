// One HTML shell keeps the practice car controls aligned with the main game.
const excluded=new Set(['analytics.js','leaderboard.js','verified-driving.js','lap-panel.js','championship.js','chat.js','spectate-menu.js','dashboard.js','release-notes.js','client-download.js','shared/track-sync.js','sidebar.js','sale.js']);
function monacoPage(html){
  return html.replace(/<script\b[^>]*src="([^"?]+)(?:\?[^" ]*)?"[^>]*><\/script>/g,(tag,src)=>excluded.has(src)?'':tag)
    .replace(/src="shared\/vehicle-spec\.js[^"]*"/,'src="shared/vehicle-spec-f1.js?v=1"')
    .replace(/(<script src="vehicle.js[^>]*><\/script>)/,'$1\n    <script src="shared/vehicle-f1.js?v=1" defer></script>\n    <script src="tracks/monaco-f1-collision.js?v=1" defer></script>')
    .replace(/(<script src="audio.js[^>]*><\/script>)/,'$1\n    <script src="tracks/monaco-f1-audio.js?v=1" defer></script>')
    .replace(/(<script src="renderer3d.js[^>]*><\/script>)/,'$1\n    <script src="tracks/monaco-f1-renderer.js?v=1" defer></script>\n    <script src="tracks/monaco-trackside-renderer.js?v=1" defer></script>')
    .replace(/<title>[^<]*<\/title>/,'<title>Monaco · LPR Motorsport</title>')
    // Anchor to the CSP meta: index.html's comment also mentions connect-src, and matching it would swallow the comment's closing -->.
    .replace(/(<meta http-equiv="Content-Security-Policy" content="[^"]*?)connect-src [^;"]+;/,"$1connect-src 'self';")
    .replace(/(<script src="shared\/track-objects.js[^>]*><\/script>)/,'$1\n    <script src="tracks/monaco-reference.js" defer></script>\n    <script src="tracks/monaco-sponsors.js?v=1" defer></script>\n    <script src="tracks/monaco-trackside.js?v=1" defer></script>\n    <script src="tracks/monaco.js" defer></script>')
    .replace('<script src="game.js','<link rel="stylesheet" href="tracks/monaco.css" />\n    <script src="tracks/monaco-f1-aids.js?v=1" defer></script>\n    <script src="tracks/monaco-practice.js" defer></script>\n    <script src="game.js')
    .replace('<body>','<body class="monaco-practice">');
}
module.exports={monacoPage};
