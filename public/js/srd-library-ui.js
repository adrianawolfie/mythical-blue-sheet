// Mythical Blue · Shared SRD feat and inventory item pickers.
(function () {
  const libraries = { feat: [], item: [] };
  const loaded = { feat: false, item: false };
  const selected = { feat: '', item: '' };

  function esc(value = '') { return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function text(value = '') { return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function clean(value = '') { return String(value).replace(/\s+/g,' ').trim(); }
  function firstUsefulSentence(value = '') {
    const cleaned = clean(value).replace(/^You gain the following benefits\.\s*/i,'');
    const match = cleaned.match(/^(.{1,220}?[.!?])(?:\s|$)/);
    return match ? match[1] : cleaned.slice(0,220);
  }
  function config(kind) {
    return kind === 'feat'
      ? { title:'Add Feat', description:'Preview an SRD feat before adding an editable snapshot to Features & Traits.', search:'Alert, Grappler, Archery…', path:'data/srd-feats.json', key:'feats', category:'category', customLabel:'+ Custom Feature / Trait' }
      : { title:'Add Item', description:'Preview an SRD equipment or magic item entry before adding an editable inventory snapshot.', search:'Scimitar, Backpack, Bag of Holding…', path:'data/srd-items.json', key:'items', category:'category', customLabel:'+ Custom Item' };
  }
  async function load(kind) {
    if (loaded[kind]) return;
    const cfg=config(kind);
    try {
      const response=await fetch(cfg.path,{cache:'no-store'});
      const data=await response.json();
      libraries[kind]=(data[cfg.key]||[]).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),undefined,{sensitivity:'base'}));
      loaded[kind]=true;
    } catch (error) { console.warn(`${cfg.title} library unavailable`,error); }
  }
  function ids(kind) { return { modal:`${kind}LibraryPickerModal`, search:`${kind}LibraryPickerSearch`, category:`${kind}LibraryPickerCategory`, results:`${kind}LibraryPickerResults`, preview:`${kind}LibraryPickerPreview`, count:`${kind}LibraryPickerCount` }; }
  function ensureModal(kind) {
    const cfg=config(kind), id=ids(kind);
    if (document.getElementById(id.modal)) return;
    document.body.insertAdjacentHTML('beforeend',`<div id="${id.modal}" class="spell-picker-backdrop library-picker-backdrop" hidden><section class="spell-picker-modal library-picker-modal" role="dialog" aria-modal="true" aria-labelledby="${kind}LibraryPickerTitle"><div class="spell-picker-header library-picker-header"><div><div class="sb-hdr" id="${kind}LibraryPickerTitle">${cfg.title}</div><p>${cfg.description}</p></div><button type="button" class="spell-picker-close" onclick="closeSrdLibraryPicker('${kind}')" aria-label="Close ${cfg.title.toLowerCase()} picker">×</button></div><div class="spell-picker-toolbar library-picker-toolbar"><label><span>Search</span><input id="${id.search}" placeholder="${cfg.search}"></label><label><span>Category</span><select id="${id.category}"><option value="all">All Categories</option></select></label></div><div class="spell-picker-layout library-picker-layout"><div id="${id.results}" class="spell-picker-results library-picker-results"></div><aside id="${id.preview}" class="library-picker-preview" aria-live="polite"><p class="library-picker-placeholder">Select an entry to preview its rules text before adding it.</p></aside></div><div class="spell-picker-footer library-picker-footer"><span id="${id.count}"></span><button type="button" class="add-btn" onclick="addCustomFromSrdPicker('${kind}')">${cfg.customLabel}</button></div></section></div>`);
    document.getElementById(id.modal)?.addEventListener('click',event=>{ if(event.target.id===id.modal) closeSrdLibraryPicker(kind); });
    document.getElementById(id.search)?.addEventListener('input',()=>render(kind));
    document.getElementById(id.category)?.addEventListener('change',()=>render(kind));
  }
  function refreshCategories(kind) {
    const cfg=config(kind), id=ids(kind), select=document.getElementById(id.category);
    if (!select) return;
    const current=select.value;
    const categories=[...new Set(libraries[kind].map(entry=>entry[cfg.category]).filter(Boolean))].sort();
    select.innerHTML='<option value="all">All Categories</option>'+categories.map(category=>`<option value="${esc(category)}">${esc(category)}</option>`).join('');
    if (categories.includes(current)) select.value=current;
  }
  function meta(kind,entry) {
    if (kind==='feat') return [entry.category,entry.prerequisite].filter(Boolean).join(' · ');
    return [entry.category,entry.rarity,entry.value,entry.weight].filter(Boolean).join(' · ');
  }
  function render(kind) {
    const cfg=config(kind), id=ids(kind), q=(document.getElementById(id.search)?.value||'').toLowerCase(), category=document.getElementById(id.category)?.value||'all';
    const results=libraries[kind].filter(entry=>(category==='all'||entry[cfg.category]===category)&&(!q||[entry.name,entry.source,entry.category,entry.rarity,entry.summary,entry.details].join(' ').toLowerCase().includes(q))).slice(0,260);
    const box=document.getElementById(id.results);
    if (box) box.innerHTML=results.map(entry=>`<div class="library-picker-result" role="button" tabindex="0" onclick="previewSrdLibraryEntry('${kind}','${esc(entry.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();previewSrdLibraryEntry('${kind}','${esc(entry.id)}')}"><span><strong>${esc(entry.name)}</strong><em>${esc(meta(kind,entry)||entry.source||'SRD 5.2.1')}</em><small>${esc(entry.source||'SRD 5.2.1')}</small></span><span class="library-picker-result-actions"><button type="button" onclick="event.stopPropagation(); previewSrdLibraryEntry('${kind}','${esc(entry.id)}')">Preview</button><button type="button" onclick="event.stopPropagation(); addSrdLibraryEntry('${kind}','${esc(entry.id)}')">Add</button></span></div>`).join('')||'<p class="spell-picker-empty">No matching entries found.</p>';
    const count=document.getElementById(id.count); if(count) count.textContent=`Showing ${results.length} of ${libraries[kind].length} entries`;
    if(selected[kind]&&!results.some(entry=>entry.id===selected[kind])) { selected[kind]=''; renderPreview(kind); }
  }
  function renderPreview(kind) {
    const id=ids(kind), box=document.getElementById(id.preview), entry=libraries[kind].find(value=>value.id===selected[kind]);
    if(!box) return;
    if(!entry){box.innerHTML='<p class="library-picker-placeholder">Select an entry to preview its rules text before adding it.</p>';return;}
    const body=kind==='item' ? `${entry.details||entry.summary||''}${entry.attunement?'\n\nRequires Attunement.':''}` : entry.details||entry.short||'';
    box.innerHTML=`<h3>${esc(entry.name)}</h3><p class="library-preview-meta">${esc(meta(kind,entry)||entry.source||'SRD 5.2.1')}</p><div class="library-preview-body">${text(body||'No description available.')}</div><div class="library-preview-actions"><button type="button" class="add-btn" onclick="addSrdLibraryEntry('${kind}','${esc(entry.id)}')">+ Add ${kind==='feat'?'Feat':'Item'}</button></div>`;
  }
  async function open(kind) {
    ensureModal(kind); await load(kind); refreshCategories(kind); selected[kind]=''; renderPreview(kind); render(kind);
    const id=ids(kind), modal=document.getElementById(id.modal); if(modal) modal.hidden=false;
    if (!window.matchMedia('(max-width: 768px)').matches) document.getElementById(id.search)?.focus();
  }
  window.openFeatPicker=()=>open('feat');
  window.openItemPicker=()=>open('item');
  window.closeSrdLibraryPicker=function(kind){ const modal=document.getElementById(ids(kind).modal); if(modal) modal.hidden=true; };
  window.previewSrdLibraryEntry=function(kind,entryId){ selected[kind]=entryId; renderPreview(kind); };
  window.addSrdLibraryEntry=function(kind,entryId){
    const entry=libraries[kind].find(value=>value.id===entryId); if(!entry) return;
    if(kind==='feat') {
      addFeatureEntry('featList',{name:entry.name,short:firstUsefulSentence(entry.details||entry.short),details:`${entry.details||''}\n\nSource: ${entry.source||'SRD 5.2.1'}`,sourceId:entry.id,source:entry.source,category:entry.category});
    } else {
      const extras=[entry.category,entry.rarity,entry.weight?`Weight: ${entry.weight}`:'',entry.attunement?'Requires Attunement':''].filter(Boolean).join(' · ');
      addUnifiedInventoryRow({name:entry.name,type:entry.type||'gear',qty:'1',value:entry.value||'',details:`${extras}${extras?'\n\n':''}${entry.details||entry.summary||''}\n\nSource: ${entry.source||'SRD 5.2.1'}`});
    }
    closeSrdLibraryPicker(kind);
  };
  window.addCustomFromSrdPicker=function(kind){ closeSrdLibraryPicker(kind); if(kind==='feat') addFeatureEntry('featList'); else addUnifiedInventoryRow(); };
  document.addEventListener('keydown',event=>{ if(event.key==='Escape'){ closeSrdLibraryPicker('feat'); closeSrdLibraryPicker('item'); } });
})();
