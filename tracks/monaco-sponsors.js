/* Fictional event partners; the only sponsor catalogue. No real brands/logos.
 * Designer handoff: 1024 x 256 px (4:1), opaque PNG, sRGB, safe text inset 6%.
 * Replace the matching PNG to swap artwork without any JavaScript changes.
 * Remove/omit image to use only the canvas wordmark; failed images do the same.
 * Keep IDs stable. Placeholder PNGs mirror this catalogue's names and colours.
 */
(function(root){
 'use strict';
 root.LPRMonacoSponsors=Object.freeze([
  {id:'lpr-motorsport',name:'LPR Motorsport',background:'#064b36',foreground:'#f9f3dd',image:'assets/monaco/sponsors/lpr-motorsport.png'},
  {id:'apexora',name:'APEXORA',background:'#ef5637',foreground:'#192635',image:'assets/monaco/sponsors/apexora.png'},
  {id:'velunex',name:'VELUNEX',background:'#153e72',foreground:'#fff0cf',image:'assets/monaco/sponsors/velunex.png'},
  {id:'caldriva',name:'CALDRIVA',background:'#f2c848',foreground:'#242e44',image:'assets/monaco/sponsors/caldriva.png'},
  {id:'orbivane',name:'ORBIVANE',background:'#783f85',foreground:'#fff4e7',image:'assets/monaco/sponsors/orbivane.png'},
  {id:'nuvoriq',name:'NUVORIQ',background:'#bbe9df',foreground:'#173a44',image:'assets/monaco/sponsors/nuvoriq.png'},
  {id:'tessavolt',name:'TESSAVOLT',background:'#eee6d2',foreground:'#9c2942',image:'assets/monaco/sponsors/tessavolt.png'},
  {id:'bravelyx',name:'BRAVELYX',background:'#222d3c',foreground:'#f4b867',image:'assets/monaco/sponsors/bravelyx.png'},
  // Period-style fictional partners: a fuel brand and a racing outfit.
  {id:'solenta',name:'SOLENTA',background:'#f7c51e',foreground:'#c8102e',image:'assets/monaco/sponsors/solenta.png'},
  {id:'rossa-corse',name:'ROSSA CORSE',background:'#d0101f',foreground:'#ffffff',image:'assets/monaco/sponsors/rossa-corse.png'}
 ].map(Object.freeze));
})(window);
