// Mythical Blue · Card-only spellbook with SRD and Mythical Blue library picker.
(function () {
  const SCHOOL_ICONS = {
    Abjuration: 'abjuration', Conjuration: 'conjuration', Divination: 'divination',
    Enchantment: 'enchantment', Evocation: 'evocation', Illusion: 'illusion',
    Necromancy: 'necromancy', Transmutation: 'transmutation', Homebrew: 'homebrew'
  };
  const AREA_ICONS = {
    sphere: 'sphere', cone: 'cone', cube: 'square', square: 'square',
    cylinder: 'cylinder', line: 'line', emanation: 'emanation', generic: 'generic'
  };
  let spellLibrary = [];
  let libraryLoaded = false;
  let editingSpellIndex = null;
  let selectedSpellPreviewId = '';
  const originalAddSR = window.addSR;
  const originalResetSpellRows = window.resetSpellRows;

  function esc(value = '') { return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function text(value = '') { return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function cleanText(value = '') { return String(value).replace(/\s+/g,' ').trim(); }
  function firstSentence(value = '') { const c=cleanText(value); if(!c) return ''; const m=c.match(/^(.{1,240}?[.!?])(?:\s|$)/); const f=m?m[1]:c; return f.length>210?`${f.slice(0,207).trim()}…`:f; }
  function icon(school='Homebrew') { return `assets/spell-icons/${SCHOOL_ICONS[school]||'homebrew'}.svg`; }
  function areaIcon(shape='') { return `assets/spell-icons/areas/${AREA_ICONS[String(shape).toLowerCase()]||'generic'}.svg`; }
  function deriveBoolean(explicitValue, fallbackText='', pattern) { return explicitValue===true || pattern.test(String(fallbackText||'')); }
  function levelRank(level='') { if(level==='C') return 0; const n=Number.parseInt(level,10); return Number.isFinite(n)?n:99; }
  function compareSpells(a,b) { const d=levelRank(a.level)-levelRank(b.level); return d || String(a.name||'').localeCompare(String(b.name||''),undefined,{sensitivity:'base'}); }
  function levelLabel(level='') { return level==='C'?'Cantrip':level?`Level ${level}`:'Unassigned'; }
  function findRow(index) { return document.querySelectorAll('#sbody .spell-main-row')[index]; }
  function getDetailsRow(row) { return row?.nextElementSibling?.classList.contains('spell-details-row')?row.nextElementSibling:null; }
  function libraryMatch(name='') { const n=String(name).toLowerCase(); return spellLibrary.find(s=>String(s.name).toLowerCase()===n); }
  function rowMetadata(row) { return {
    sourceId:row.dataset.sourceId||'', source:row.dataset.source||'', school:row.dataset.school||'Homebrew',
    duration:row.dataset.duration||'', componentsText:row.dataset.componentsText||'', classes:row.dataset.classes||'',
    attackSave:row.dataset.attackSave||'', damageHealing:row.dataset.damageHealing||'', damageType:row.dataset.damageType||'',
    areaShape:row.dataset.areaShape||'', areaSize:row.dataset.areaSize||'',
    prepared:row.dataset.prepared==='true'
  }; }
  function syncCheckboxes(row,data={},match=null) { if(!row)return; const r=match||data; const duration=data.duration||row.dataset.duration||r?.duration||''; const cast=data.castTime||r?.castTime||''; const comp=data.componentsText||row.dataset.componentsText||r?.componentsText||''; const c=deriveBoolean(r?.concentration,duration,/concentration/i); const ritual=deriveBoolean(r?.ritual,cast,/ritual/i); const mat=deriveBoolean(r?.material,comp,/(^|,\s*)M(?:\s|,|\(|$)/i); const ci=row.querySelector('.spell-concentration'), ri=row.querySelector('.spell-ritual'), mi=row.querySelector('.spell-material'); if(ci)ci.checked=c;if(ri)ri.checked=ritual;if(mi)mi.checked=mat; }
  function enhanceRow(row,data={}) { if(!row)return; const name=row.querySelector('.spell-name')?.value||data.name||''; const match=libraryMatch(name); const meta={
    sourceId:data.sourceId||row.dataset.sourceId||match?.id||'', source:data.source||row.dataset.source||match?.source||'',
    school:data.school||row.dataset.school||match?.school||'Homebrew', duration:data.duration||row.dataset.duration||match?.duration||'',
    componentsText:data.componentsText||row.dataset.componentsText||match?.componentsText||'', classes:Array.isArray(data.classes)?data.classes.join(', '):data.classes||row.dataset.classes||(match?.classes||[]).join(', '),
    attackSave:data.attackSave||row.dataset.attackSave||match?.attackSave||'', damageHealing:data.damageHealing||row.dataset.damageHealing||match?.damageHealing||'',
    damageType:data.damageType||row.dataset.damageType||match?.damageType||'', areaShape:data.areaShape||row.dataset.areaShape||match?.areaShape||'', areaSize:data.areaSize||row.dataset.areaSize||match?.areaSize||'',
    prepared:typeof data.prepared==='boolean'?String(data.prepared):(row.dataset.prepared||'false')
  }; Object.entries(meta).forEach(([k,v])=>row.dataset[k]=v||''); syncCheckboxes(row,data,match); }
  function enhanceAll(){document.querySelectorAll('#sbody .spell-main-row').forEach(r=>enhanceRow(r));}

  window.addSR=function(data={}){const duration=data.duration||'', cast=data.castTime||'', comp=data.componentsText||''; const enriched={...data, concentration:deriveBoolean(data.concentration,duration,/concentration/i), ritual:deriveBoolean(data.ritual,cast,/ritual/i), material:deriveBoolean(data.material,comp,/(^|,\s*)M(?:\s|,|\(|$)/i), effect:data.effect||data.effectSummary||firstSentence(data.details||'')}; originalAddSR(enriched); const rows=document.querySelectorAll('#sbody .spell-main-row'); enhanceRow(rows[rows.length-1],enriched); refreshSpellCards(); };
  window.resetSpellRows=function(rows){ if(rows===undefined){originalResetSpellRows();enhanceAll();refreshSpellCards();return;} const b=document.getElementById('sbody'); if(!b)return; b.innerHTML=''; (rows||[]).forEach(r=>window.addSR(r)); refreshSpellCards(); };
  window.collectSpellRows=function(){return Array.from(document.querySelectorAll('#sbody .spell-main-row')).map(row=>{const d=getDetailsRow(row);return {level:row.querySelector('.spell-level')?.value||'',name:row.querySelector('.spell-name')?.value||'',castTime:row.querySelector('.spell-cast-time')?.value||'',range:row.querySelector('.spell-range')?.value||'',concentration:row.querySelector('.spell-concentration')?.checked||false,ritual:row.querySelector('.spell-ritual')?.checked||false,material:row.querySelector('.spell-material')?.checked||false,effect:row.querySelector('.spell-effect')?.value||'',details:d?.querySelector('.spell-details')?.value||'',open:false,...rowMetadata(row)};});};

  async function loadLibrary(){if(libraryLoaded)return;try{const r=await fetch('data/srd-spells.json',{cache:'no-store'});const j=await r.json();spellLibrary=(j.spells||[]).sort(compareSpells);libraryLoaded=true;enhanceAll();refreshSpellCards();}catch(e){console.warn('Spell library unavailable',e);}}
  window.openSpellPicker=async function(){await loadLibrary();const m=document.getElementById('spellPickerModal');if(!m)return;m.hidden=false;selectedSpellPreviewId='';renderSpellPreview();if(!window.matchMedia('(max-width: 768px)').matches)document.getElementById('spellPickerSearch')?.focus();renderPicker();};
  window.closeSpellPicker=function(){const m=document.getElementById('spellPickerModal');if(m)m.hidden=true;};
  window.addSpellFromLibrary=function(id){const s=spellLibrary.find(x=>x.id===id);if(!s)return;window.addSR({...s,effect:s.effectSummary||firstSentence(s.details)});closeSpellPicker();};
  window.previewSpellFromLibrary=function(id){selectedSpellPreviewId=id;renderSpellPreview();};
  function renderSpellPreview(){const box=document.getElementById('spellPickerPreview');if(!box)return;const s=spellLibrary.find(x=>x.id===selectedSpellPreviewId);if(!s){box.innerHTML='<p class="library-picker-placeholder">Select a spell to preview its full rules text before adding it.</p>';return;}box.innerHTML=`<h3>${esc(s.name)}</h3><p class="library-preview-meta">${esc(levelLabel(s.level))} · ${esc(s.school||'Unassigned')} · ${esc((s.classes||[]).join(', ')||'No class listed')}</p><div class="library-preview-body"><strong>Casting Time:</strong> ${esc(s.castTime||'—')}
<strong>Range:</strong> ${esc(s.range||'—')}
<strong>Components:</strong> ${esc(s.componentsText||'—')}
<strong>Duration:</strong> ${esc(s.duration||'—')}

${text(s.details||s.effectSummary||'No description available.')}</div><div class="library-preview-actions"><button type="button" class="add-btn" onclick="addSpellFromLibrary('${esc(s.id)}')">+ Add Spell</button></div>`;}
  function renderPicker(){const q=(document.getElementById('spellPickerSearch')?.value||'').toLowerCase(), level=document.getElementById('spellPickerLevel')?.value||'all', school=document.getElementById('spellPickerSchool')?.value||'all', cls=document.getElementById('spellPickerClass')?.value||'all'; const results=spellLibrary.filter(s=>(!q||[s.name,s.school,s.source,(s.classes||[]).join(' ')].join(' ').toLowerCase().includes(q))&&(level==='all'||s.level===level)&&(school==='all'||s.school===school)&&(cls==='all'||(s.classes||[]).includes(cls))).slice(0,220); const box=document.getElementById('spellPickerResults');if(box)box.innerHTML=results.map(s=>`<div class="spell-picker-result" role="button" tabindex="0" onclick="previewSpellFromLibrary('${esc(s.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();previewSpellFromLibrary('${esc(s.id)}')}"><img src="${icon(s.school)}" alt="" aria-hidden="true"><span><strong>${esc(s.name)}</strong><em>${esc(levelLabel(s.level))} · ${esc(s.school)} · ${esc((s.classes||[]).join(', ')||'Homebrew')}</em><small>${esc(s.source||'Custom')}</small></span><span class="spell-picker-result-actions"><button type="button" onclick="event.stopPropagation(); previewSpellFromLibrary('${esc(s.id)}')">Preview</button><button type="button" onclick="event.stopPropagation(); addSpellFromLibrary('${esc(s.id)}')">Add</button></span></div>`).join('')||'<p class="spell-picker-empty">No matching spells found.</p>';const c=document.getElementById('spellPickerCount');if(c)c.textContent=`Showing ${results.length} of ${spellLibrary.length} spells`;if(selectedSpellPreviewId&&!results.some(s=>s.id===selectedSpellPreviewId)){selectedSpellPreviewId='';renderSpellPreview();}}

  function filters(){return {query:(document.getElementById('spellSearchInput')?.value||'').toLowerCase(),level:document.getElementById('spellLevelFilter')?.value||'all',school:document.getElementById('spellSchoolFilter')?.value||'all',preparedOnly:document.getElementById('spellPreparedFilter')?.checked||false};}
  function matches(s,f){const school=s.school||'Homebrew';return(!f.query||[s.name,s.effect,s.details,s.school,s.source,s.damageType,s.damageHealing].join(' ').toLowerCase().includes(f.query))&&(f.level==='all'||s.level===f.level)&&(f.school==='all'||school===f.school)&&(!f.preparedOnly||s.prepared);}
  window.applySpellFilters=function(){refreshSpellCards();};
  function properties(s){const c=s.componentsText||'';const flags=[['V',/(^|,\s*)V(?:,|\s|$)/i.test(c)],['S',/(^|,\s*)S(?:,|\s|$)/i.test(c)],['M',s.material],['C',s.concentration],['R',s.ritual]];return flags.map(([l,a])=>`<span class="spell-property-chip ${a?'active':''}" title="${l}">${l}</span>`).join('');}
  function cardTeaser(s){return cleanText(s.effect||'')||firstSentence(s.details||'')||'No short effect entered yet.';}
  function cleanAreaSize(size='',shape=''){const raw=cleanText(size);const shapeText=cleanText(shape);if(!raw||!shapeText)return raw;return raw.replace(new RegExp(`\\s*${shapeText}\\s*$`,'i'),'').trim();}
  function derivedEffect(s={}){
    const details=cleanText(s.details||'');
    let damageHealing=cleanText(s.damageHealing||'');
    let damageType=cleanText(s.damageType||'');
    if(!damageHealing){
      const heal=details.match(/(?:regains?|restore(?:s|d)?|heal(?:s|ed)?)\s+(?:a number of hit points equal to\s+)?((?:\d+d\d+|\d+)(?:\s*[+−-]\s*\d+)?)/i);
      const damage=details.match(/((?:\d+d\d+|\d+)(?:\s*[+−-]\s*\d+)?)\s+([A-Za-z]+)\s+damage/i);
      if(heal)damageHealing=heal[1]; else if(damage)damageHealing=damage[1];
      if(!damageType&&damage)damageType=damage[2];
    }
    return {damageHealing,damageType};
  }
  function rangeArea(s){const area=s.areaShape||s.areaSize;if(!area)return `<span>${esc(s.range||'—')}</span>`;const areaSize=cleanAreaSize(s.areaSize,s.areaShape);return `<span>${esc(s.range||'—')}</span><span class="spell-area-inline" title="${esc(s.areaShape||'Area of effect')}"><img src="${areaIcon(s.areaShape)}" alt="" aria-hidden="true"><span>${esc(areaSize||'')}</span></span>`;}
  function effectBlock(s){const effect=derivedEffect(s);const main=[effect.damageHealing,effect.damageType].filter(Boolean).join(' · ');if(!main)return '<span>—</span>';return `<span>${esc(main)}</span>`;}
  function cardDetails(s){const effect=derivedEffect(s);return `<div class="spell-card-detail-grid"><div><strong>Level</strong><span>${esc(levelLabel(s.level))}</span></div><div><strong>Casting Time</strong><span>${esc(s.castTime||'—')}</span></div><div><strong>Range / Area</strong>${rangeArea(s)}</div><div><strong>Components</strong><span>${esc(s.componentsText||'—')}</span></div><div><strong>Duration</strong><span>${esc(s.duration||'—')}</span></div><div><strong>School</strong><span>${esc(s.school||'Homebrew')}</span></div><div><strong>Attack / Save</strong><span>${esc(s.attackSave||'—')}</span></div><div><strong>Damage / Healing</strong><span>${esc([effect.damageHealing,effect.damageType].filter(Boolean).join(' · ')||'—')}</span></div><div><strong>Classes</strong><span>${esc(s.classes||'—')}</span></div><div><strong>Source</strong><span>${esc(s.source||'Custom')}</span></div></div><div class="spell-card-rule-text">${text(s.details||'No full description entered yet.')}</div>`;}
  window.refreshSpellCards=function(){
    const box=document.getElementById('spellCardView');
    if(!box)return;
    const f=filters();
    const spells=window.collectSpellRows()
      .map((s,index)=>({...s,index}))
      .filter(s=>s.name&&matches(s,f))
      .sort(compareSpells);

    box.innerHTML=spells.map(s=>`<article class="spell-card">
      <div class="spell-card-topline">
        <img class="spell-school-icon" src="${icon(s.school||'Homebrew')}" alt="" aria-hidden="true">
        <span class="spell-level-badge"><span>${esc(s.level||'—')}</span></span>
        <div class="spell-card-title-wrap">
          <div class="spell-card-title">${esc(s.name)}</div>
          <div class="spell-card-school">${esc(s.school||'Homebrew')}</div>
        </div>
        <button class="spell-prepared-toggle ${s.prepared?'is-prepared':''}" type="button" onclick="toggleSpellPrepared(${s.index})" aria-pressed="${s.prepared?'true':'false'}" aria-label="${s.prepared?'Prepared spell. Click to unprepare.':'Not prepared. Click to prepare.'}" title="${s.prepared?'Prepared spell':'Mark as prepared'}"><span aria-hidden="true">✦</span></button>
      </div>
      <div class="spell-card-meta-grid">
        <div class="spell-card-quick"><strong>Cast</strong><span>${esc(s.castTime||'—')}</span></div>
        <div class="spell-card-quick"><strong>Duration</strong><span>${esc(s.duration||'—')}</span></div>
        <div class="spell-card-quick spell-card-range"><strong>Range / Area</strong>${rangeArea(s)}</div>
        <div class="spell-card-quick"><strong>Attack / Save</strong><span>${esc(s.attackSave||'—')}</span></div>
        <div class="spell-card-quick spell-card-damage"><strong>Damage / Healing</strong>${effectBlock(s)}</div>
      </div>
      <div class="spell-card-subrow">
        <div class="spell-card-properties">${properties(s)}</div>
        <div class="spell-card-teaser">${text(cardTeaser(s))}</div>
      </div>
      <div class="spell-card-footer">
        <button class="spell-card-expand" type="button" onclick="toggleSpellCardDetails(this)" aria-expanded="false">Details ▾</button>
        <button class="spell-card-edit-inline" type="button" onclick="editSpellFromCard(${s.index})">Edit</button>
      </div>
      <div class="spell-card-details" hidden>${cardDetails(s)}<div class="spell-card-actions"><button class="spell-card-btn" type="button" onclick="editSpellFromCard(${s.index})">Edit Spell</button></div></div>
    </article>`).join('')||'<p class="spell-picker-empty">No spells match the current filters.</p>';
  };
  window.toggleSpellPrepared=function(index){
    const row=findRow(index);
    if(!row)return;
    row.dataset.prepared=row.dataset.prepared==='true'?'false':'true';
    refreshSpellCards();
  };
  window.toggleSpellCardDetails=function(btn){const card=btn.closest('.spell-card');const d=card?.querySelector('.spell-card-details');if(!d)return;d.hidden=!d.hidden;card.classList.toggle('is-open',!d.hidden);btn.textContent=d.hidden?'Details ▾':'Details ▴';btn.setAttribute('aria-expanded',d.hidden?'false':'true');};

  function ensureEditor(){if(document.getElementById('spellEditorModal'))return;document.body.insertAdjacentHTML('beforeend',`<div id="spellEditorModal" class="spell-editor-backdrop" hidden><section class="spell-editor-modal" role="dialog" aria-modal="true" aria-labelledby="spellEditorTitle"><div class="spell-editor-header"><div><div class="sb-hdr" id="spellEditorTitle">Edit Spell</div><p>Adjust the structured card fields or write your own homebrew spell.</p></div><button type="button" class="spell-picker-close" onclick="closeSpellEditor()" aria-label="Close spell editor">×</button></div><div class="spell-editor-grid"><label><span>Name</span><input id="spellEditName"></label><label><span>Level</span><input id="spellEditLevel" placeholder="C, 1, 2…"></label><label><span>School</span><input id="spellEditSchool"></label><label><span>Source</span><input id="spellEditSource"></label><label><span>Casting Time</span><input id="spellEditCast"></label><label><span>Range</span><input id="spellEditRange"></label><label><span>Duration</span><input id="spellEditDuration"></label><label><span>Components</span><input id="spellEditComponents"></label><label><span>Classes</span><input id="spellEditClasses"></label><label><span>Attack / Save</span><input id="spellEditAttackSave"></label><label><span>Damage / Healing</span><input id="spellEditDamageHealing"></label><label><span>Damage Type / Effect</span><input id="spellEditDamageType"></label><label><span>Area Shape</span><select id="spellEditAreaShape"><option value="">None</option><option>Sphere</option><option>Cone</option><option>Square</option><option>Cube</option><option>Cylinder</option><option>Line</option><option>Emanation</option></select></label><label><span>Area Size</span><input id="spellEditAreaSize" placeholder="20 ft radius"></label></div><div class="spell-editor-checks"><label><input id="spellEditConcentration" type="checkbox"> Concentration</label><label><input id="spellEditRitual" type="checkbox"> Ritual</label><label><input id="spellEditMaterial" type="checkbox"> Material</label><label><input id="spellEditPrepared" type="checkbox"> Prepared</label></div><label class="spell-editor-wide"><span>Short Card Effect</span><textarea id="spellEditEffect" rows="3"></textarea></label><label class="spell-editor-wide"><span>Full Rules Text</span><textarea id="spellEditDetails" rows="12"></textarea></label><div class="spell-editor-actions"><button type="button" class="add-btn spell-editor-delete" onclick="deleteEditedSpell()">Delete Spell</button><span></span><button type="button" class="add-btn" onclick="closeSpellEditor()">Cancel</button><button type="button" class="add-btn" onclick="saveSpellEditor()">Save Spell</button></div></section></div>`);document.getElementById('spellEditorModal')?.addEventListener('click',e=>{if(e.target.id==='spellEditorModal')closeSpellEditor();});}
  function setVal(id,v=''){const el=document.getElementById(id);if(el)el.value=v||'';} function setCheck(id,v){const el=document.getElementById(id);if(el)el.checked=!!v;}
  window.editSpellFromCard=function(index){ensureEditor();editingSpellIndex=index;const s=window.collectSpellRows()[index]||{};setVal('spellEditName',s.name);setVal('spellEditLevel',s.level);setVal('spellEditSchool',s.school==='Homebrew'?'':s.school);setVal('spellEditSource',s.source);setVal('spellEditCast',s.castTime);setVal('spellEditRange',s.range);setVal('spellEditDuration',s.duration);setVal('spellEditComponents',s.componentsText);setVal('spellEditClasses',s.classes);setVal('spellEditAttackSave',s.attackSave);setVal('spellEditDamageHealing',s.damageHealing);setVal('spellEditDamageType',s.damageType);setVal('spellEditAreaShape',s.areaShape);setVal('spellEditAreaSize',s.areaSize);setVal('spellEditEffect',s.effect);setVal('spellEditDetails',s.details);setCheck('spellEditConcentration',s.concentration);setCheck('spellEditRitual',s.ritual);setCheck('spellEditMaterial',s.material);setCheck('spellEditPrepared',s.prepared);document.getElementById('spellEditorModal').hidden=false;document.getElementById('spellEditName')?.focus();};
  window.closeSpellEditor=function(){const m=document.getElementById('spellEditorModal');if(m)m.hidden=true;editingSpellIndex=null;};
  window.saveSpellEditor=function(){if(editingSpellIndex===null)return;const row=findRow(editingSpellIndex),details=getDetailsRow(row);if(!row)return;const get=id=>document.getElementById(id)?.value||'';row.querySelector('.spell-name').value=get('spellEditName');row.querySelector('.spell-level').value=get('spellEditLevel');row.querySelector('.spell-cast-time').value=get('spellEditCast');row.querySelector('.spell-range').value=get('spellEditRange');row.querySelector('.spell-effect').value=get('spellEditEffect');row.querySelector('.spell-concentration').checked=document.getElementById('spellEditConcentration')?.checked||false;row.querySelector('.spell-ritual').checked=document.getElementById('spellEditRitual')?.checked||false;row.querySelector('.spell-material').checked=document.getElementById('spellEditMaterial')?.checked||false;if(details?.querySelector('.spell-details'))details.querySelector('.spell-details').value=get('spellEditDetails');Object.entries({school:get('spellEditSchool')||'Homebrew',source:get('spellEditSource')||'Homebrew / Custom',duration:get('spellEditDuration'),componentsText:get('spellEditComponents'),classes:get('spellEditClasses'),attackSave:get('spellEditAttackSave'),damageHealing:get('spellEditDamageHealing'),damageType:get('spellEditDamageType'),areaShape:get('spellEditAreaShape'),areaSize:get('spellEditAreaSize'),prepared:String(document.getElementById('spellEditPrepared')?.checked||false)}).forEach(([k,v])=>row.dataset[k]=v||'');closeSpellEditor();refreshSpellCards();};
  window.deleteEditedSpell=function(){if(editingSpellIndex===null)return;if(!confirm('Remove this spell?'))return;const row=findRow(editingSpellIndex),details=getDetailsRow(row);details?.remove();row?.remove();closeSpellEditor();refreshSpellCards();};
  window.addCustomSpell=function(){window.addSR({source:'Homebrew / Custom',school:'Homebrew'});const rows=document.querySelectorAll('#sbody .spell-main-row');editSpellFromCard(rows.length-1);};
  window.setSpellView=function(){const cards=document.getElementById('spellCardView'),list=document.getElementById('spellListView');if(cards)cards.hidden=false;if(list)list.hidden=true;localStorage.setItem('mythical-blue-spell-view','cards');refreshSpellCards();};

  function bind(){['spellLevelFilter','spellSchoolFilter','spellSearchInput','spellPreparedFilter'].forEach(id=>document.getElementById(id)?.addEventListener('input',applySpellFilters));['spellPickerSearch','spellPickerLevel','spellPickerSchool','spellPickerClass'].forEach(id=>document.getElementById(id)?.addEventListener('input',renderPicker));document.getElementById('spellPickerModal')?.addEventListener('click',e=>{if(e.target.id==='spellPickerModal')closeSpellPicker();});document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeSpellPicker();closeSpellEditor();}});document.getElementById('sbody')?.addEventListener('input',refreshSpellCards);document.getElementById('sbody')?.addEventListener('change',refreshSpellCards);enhanceAll();setSpellView();loadLibrary();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
