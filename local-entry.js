// A directly opened game must use the same server data as the local editor.
// Kept as a file so the page's Content-Security-Policy can forbid inline scripts.
if (window.location.protocol === 'file:') {
  window.location.replace('http://localhost:8000/' + (window.location.search || ''));
}
