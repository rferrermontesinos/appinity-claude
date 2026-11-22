/* Selector claro/oscuro compartido por index.html, concept.html e icons.html. «Noche de cine» es OSCURA por defecto:
   sin elección guardada se usa oscuro (valor ""), salvo que el sistema pida claro explícitamente. */
(function(){
  var KEY='appinity-ds-theme', root=document.documentElement, t=null;
  try{ t=localStorage.getItem(KEY); }catch{ /* sin almacenamiento (modo privado, file://) */ }
  if(t===null && window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches) t='light';
  function apply(v){ if(v) root.setAttribute('data-theme',v); else root.removeAttribute('data-theme'); }
  apply(t);
  document.addEventListener('DOMContentLoaded',function(){
    var sel=document.getElementById('themeSel'); if(!sel) return;
    sel.value=t||'';
    sel.addEventListener('change',function(){ apply(sel.value); try{ localStorage.setItem(KEY,sel.value); }catch{ /* sin almacenamiento (modo privado, file://) */ } });
  });
})();
