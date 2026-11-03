// Public nickname policy, applied when a new name is chosen (account, guest, legacy leaderboard).
// Inlined into both pasteable Workers by scripts/bundle-verified-worker.cjs and scripts/embed-admin.cjs:
// keep this file free of imports.
//
// Names are folded before matching so common evasions still hit: case, accents, full-width
// letters, separators ("n.e e_k"), digits for letters ("n33k"), Cyrillic/Greek look-alikes
// and stretched letters ("neeeekeri"). Add new entries in folded form (see nameSkeleton).
const NAME_LEET={0:'o',1:'i',3:'e',4:'a',5:'s',6:'g',7:'t',9:'g'};
const NAME_CONFUSABLES={'а':'a','в':'b','е':'e','ё':'e','к':'k','м':'m','н':'h','о':'o','р':'p','с':'c','т':'t','у':'y','х':'x','і':'i','ї':'i','ј':'j','ѕ':'s','ԁ':'d','ԛ':'q','ԝ':'w',
 'α':'a','β':'b','ε':'e','η':'n','ι':'i','κ':'k','μ':'m','ν':'v','ο':'o','ρ':'p','τ':'t','υ':'u','χ':'x','ϲ':'c'};
// Matched against the skeleton with repeated letters squeezed ("neekeri" -> "nekeri").
const NAME_SQUEEZED=['neker','nekru','niger','niga','nigr','neger','fagot','trany','mutakuon','ratipa','vinosilm','hitler','siegheil','wetbak','raghead','towelhead','chink'];
// Matched against the unsqueezed skeleton where squeezing would also hit ordinary names.
const NAME_PLAIN=['ryssa','hintti'];
// Matched against the raw lowercase text with separators removed (digits kept as digits).
const NAME_RAW=['1488'];
export function nameSkeleton(name){
 const folded=String(name).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[\s_.-]+/g,'');
 return [...folded].map(c=>NAME_LEET[c]??NAME_CONFUSABLES[c]??c).join('');
}
// Latin mixed with Cyrillic or Greek letters is how look-alike names impersonate others ("Pаnu").
const mixedScripts=name=>/\p{Script=Latin}/u.test(name)&&/[\p{Script=Cyrillic}\p{Script=Greek}]/u.test(name);
export function allowedName(name){
 if(typeof name!=='string'||mixedScripts(name))return false;
 const plain=nameSkeleton(name),squeezed=plain.replace(/(.)\1+/g,'$1');
 const raw=name.normalize('NFKC').toLowerCase().replace(/[\s_.-]+/g,'');
 return !NAME_SQUEEZED.some(word=>squeezed.includes(word))&&!NAME_PLAIN.some(word=>plain.includes(word))&&!NAME_RAW.some(word=>raw.includes(word));
}
