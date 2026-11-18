'use strict';
const $=id=>document.getElementById(id),e=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const markets=['CAISO','ERCOT','PJM','MISO','SPP','NYISO','ISO-NE'];
const sections=['Documents','Intake & checks','Design','Packet'];
const initial=()=>({role:'client',screen:'intro',clientScreen:'intro',adminScreen:'documents',type:'generation',market:'CAISO',plan:'Demo',allowed:['CAISO'],brief:'',guideDraft:'',guideNotes:[],name:'',example:false,exampleIndex:null,answers:{},fields:{},files:[],outputs:[],status:'Draft',submitted:false,confirmed:false,extracted:false,mapped:false,previewed:false,release:null,releaseCount:0,notifications:'',events:[],preview:false,missing:'Technical workbook or an available equipment schedule.',token:0});
let S=initial(),panelKind='',draftAccess=null,liveFiles=new Map(),toastTimer,pendingRemoveFileId=null,removeFileTrigger=null;
let projectSnapshots=new Map(),currentProjectId=1,nextProjectId=2,projectPanelTrigger=null,panelReturnFocus=null;
let organizingFileIds=new Set(),organizingQueue=[],organizeTimer=0;
let typingFrame=0,typingInput=null,activePromptFlight=null;
let replyTimer=0,replyPending=false,replyRevealing=false,replyKind='',replySerial=0;
const expandedGuideDisclosures=new Set();
const workspaceKey='gridpilot-ai-guided-yuko-workspace-v1';
const fileDatabaseName='gridpilot-ai-guided-yuko-files-v1';
let restoredScrollY=0,fileDatabasePromise=null,fileWrites=Promise.resolve(),filesReady=Promise.resolve(),fileEpoch=0;
function conversationScrollTop(){return S.screen==='intro'?window.scrollY:$('app').scrollTop}
function persistWorkspace(){
 if(S.screen==='processing')return;
 try{localStorage.setItem(workspaceKey,JSON.stringify({version:1,state:S,projects:[...projectSnapshots],currentProjectId,nextProjectId,scrollY:conversationScrollTop()}))}catch{}
}
function restoreWorkspace(){
 try{
  const data=JSON.parse(localStorage.getItem(workspaceKey)||'null');
  if(data?.version!==1||!data.state||typeof data.state!=='object')return;
  const state=data.state;
  if(!['intro','chat','brief','documents','waiting','admin-empty','intake','design','packet'].includes(state.screen))return;
  S={...initial(),...state,answers:{...(state.answers||{})},fields:{...(state.fields||{})}};
  S.files=Array.isArray(state.files)?state.files:[];
  S.outputs=Array.isArray(state.outputs)?state.outputs:[];
  S.allowed=Array.isArray(state.allowed)?state.allowed:['CAISO'];
  S.events=Array.isArray(state.events)?state.events:[];
  S.guideNotes=Array.isArray(state.guideNotes)?state.guideNotes.filter(note=>note&&typeof note.screen==='string'&&typeof note.text==='string'):[];
  S.role=state.role==='admin'?'admin':'client';
  S.token=0;
  projectSnapshots=new Map(Array.isArray(data.projects)?data.projects:[]);
  currentProjectId=Number.isInteger(data.currentProjectId)?data.currentProjectId:1;
  nextProjectId=Number.isInteger(data.nextProjectId)?data.nextProjectId:currentProjectId+1;
  restoredScrollY=Number.isFinite(data.scrollY)?Math.max(0,data.scrollY):0;
 }catch{}
}
function openFileDatabase(){
 if(!fileDatabasePromise)fileDatabasePromise=new Promise(resolve=>{
  if(!window.indexedDB){resolve(null);return}
  try{
   const request=window.indexedDB.open(fileDatabaseName,1);
   request.onupgradeneeded=()=>request.result.createObjectStore('files');
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>resolve(null);
   request.onblocked=()=>resolve(null);
  }catch{resolve(null)}
 });
 return fileDatabasePromise;
}
function queueFileWrite(action){
 fileWrites=fileWrites.then(async()=>{
  const db=await openFileDatabase();
  if(!db)return;
  await new Promise(resolve=>{
   const transaction=db.transaction('files','readwrite');
   transaction.oncomplete=resolve;
   transaction.onerror=resolve;
   transaction.onabort=resolve;
   action(transaction.objectStore('files'));
  });
 }).catch(()=>{});
}
function storeLocalFile(id,file){queueFileWrite(store=>store.put(file,id))}
function removeStoredFile(id){queueFileWrite(store=>store.delete(id))}
function clearStoredFiles(){fileEpoch++;queueFileWrite(store=>store.clear())}
function restoreStoredFiles(){
 const epoch=fileEpoch;
 return fileWrites.then(async()=>{
  const db=await openFileDatabase();
  if(!db)return;
  await new Promise(resolve=>{
   const request=db.transaction('files').objectStore('files').openCursor();
   request.onsuccess=()=>{
    const cursor=request.result;
    if(!cursor){resolve();return}
    if(epoch===fileEpoch)liveFiles.set(cursor.key,cursor.value);
    cursor.continue();
   };
   request.onerror=()=>resolve();
  });
 }).catch(()=>{});
}
const btn=(label,action,cls='',disabled=false,attrs='')=>`<button data-action="${action}" class="${cls}" ${disabled?'disabled':''} ${attrs}>${label}</button>`;
const tag=(text,kind='')=>`<span class="tag ${kind}">${e(text)}</span>`;
const mark=()=>'<img src="assets-edit/gridpilot-mark.png" alt="GridPilot" />';
const themeToggle=$('theme-toggle');
let themeTransitionTimer=0;
function setTheme(theme){
 const dark=theme==='dark';
 document.documentElement.dataset.theme=theme;
 themeToggle.setAttribute('aria-checked',String(dark));
 themeToggle.title=dark?'Turn off dark mode':'Turn on dark mode';
 try{localStorage.setItem('gridpilot-ai-guided-yuko-theme',theme)}catch{}
}
themeToggle.addEventListener('click',()=>{
 clearTimeout(themeTransitionTimer);
 document.documentElement.classList.add('theme-changing');
 setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
 themeTransitionTimer=setTimeout(()=>document.documentElement.classList.remove('theme-changing'),300);
});
setTheme(document.documentElement.dataset.theme==='dark'?'dark':'light');
function closeProfileMenu(restoreFocus=false){
 const menu=$('profile-menu');
 if(!menu||menu.hidden)return;
 const focusWasInside=menu.contains(document.activeElement);
 menu.hidden=true;
 $('profile-trigger').setAttribute('aria-expanded','false');
 if(restoreFocus||focusWasInside)$('profile-trigger').focus();
}
function toggleProfileMenu(){
 const menu=$('profile-menu');
 if(!menu.hidden){closeProfileMenu(true);return}
 menu.hidden=false;
 $('profile-trigger').setAttribute('aria-expanded','true');
 menu.querySelector('[role="menuitem"]')?.focus();
}
function updateProfile(){
 const admin=S.role==='admin';
 $('profile-trigger-name').textContent=admin?'GridPilot Admin':'Example Energy';
 $('profile-trigger-avatar').textContent=admin?'GA':'EE';
 $('profile-menu').setAttribute('aria-label',admin?'Administrator menu':'Client menu');
 $('profile-access-item').hidden=!admin;
}
const sendIcon='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="M12 19V5m-7 7 7-7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const detailsChevron='<svg class="details-chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const agent=(html,extra='')=>`<div class="assistant arrive ${extra}">${mark()}<div class="assistant-copy">${html}</div></div>`;
const typingAgent=()=>agent('<span class="guide-typing-status" role="status">Putting this together<span class="guide-typing-dots" aria-hidden="true"><i></i><i></i><i></i></span></span>','guide-typing');
const user=()=>`<div class="user-line">${e(S.brief)}</div>`;
const activeProject=()=>S.role==='client'&&S.release&&['intake','design','packet'].includes(S.screen)?S.release.project:S;
function toast(t){clearTimeout(toastTimer);$('toast').textContent=t;$('toast').className='show';toastTimer=setTimeout(()=>{$('toast').className='';$('toast').textContent=''},3500)}
function cancelPromptFlight(){
 if(!activePromptFlight)return;
 const flight=activePromptFlight;
 activePromptFlight=null;
 flight.animations.forEach(animation=>animation.cancel());
 flight.shell.remove();
 flight.layer.remove();
 flight.conversation.classList.remove('prompt-handoff');
}
function followConversation(previousY=conversationScrollTop()){
 requestAnimationFrame(()=>{
  if(S.screen==='intro'){window.scrollTo({top:0,behavior:'instant'});return}
  const app=$('app');
  const maxScroll=Math.max(0,app.scrollHeight-app.clientHeight);
  app.scrollTop=Math.min(previousY,maxScroll);
  const messages=[...app.querySelectorAll('.user-line')];
  const last=messages.at(-1);
  if(!last)return;
  const appRect=app.getBoundingClientRect();
  const composerHeight=$('guide-composer-form')?.getBoundingClientRect().height||96;
  const visibleBottom=appRect.bottom-composerHeight-20;
  const userRect=last.getBoundingClientRect();
  const reply=[...app.querySelectorAll('.assistant')].find(item=>item.getBoundingClientRect().top>=userRect.bottom-1);
  const replyRect=reply?.getBoundingClientRect();
  const revealBottom=replyRect?replyRect.top+Math.min(replyRect.height,120):userRect.bottom;
  const needed=Math.max(0,app.scrollTop+revealBottom-visibleBottom);
  const keepUserVisible=Math.max(0,app.scrollTop+userRect.top-appRect.top-24);
  const target=Math.min(maxScroll,Math.min(needed,keepUserVisible));
  if(Math.abs(target-app.scrollTop)<2)return;
  app.scrollTo({top:target,behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 });
}
function stopAssistantReply(){clearTimeout(replyTimer);replySerial++;replyPending=false;replyRevealing=false;replyKind=''}
function startAssistantReply(kind,previousY=conversationScrollTop(),onReady){
 stopAssistantReply();
 const app=$('app');
 app.style.minHeight='';
 replyPending=true;
 replyKind=kind;
 render();
 followConversation(previousY);
 const serial=replySerial;
 replyTimer=setTimeout(()=>{
  if(serial!==replySerial)return;
  $('app').querySelectorAll('.guide-typing').forEach(item=>item.classList.add('guide-typing-exit'));
  replyTimer=setTimeout(()=>{
   if(serial!==replySerial)return;
   replyPending=false;
   replyRevealing=true;
   const currentY=conversationScrollTop();
   render();
   if(S.screen==='waiting'&&S.status!=='Action needed')$('app').style.minHeight='';
   followConversation(currentY);
   if(onReady)requestAnimationFrame(onReady);
   replyRevealing=false;
  },window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?0:120);
 },kind==='stage'?620:520);
}
function move(screen){const previousY=S.screen==='intro'?0:conversationScrollTop();cancelPromptFlight();S.token++;S.screen=screen;if(S.role==='client')S.clientScreen=screen;else S.adminScreen=screen;if(screen==='intro'){stopAssistantReply();$('app').style.minHeight='';render();followConversation(previousY)}else startAssistantReply('stage',previousY)}
function saveCurrentProject(){
 if(S.screen==='intro'){
  stopPromptTyping(true);
  const input=$('brief-input');
  if(input)S.brief=input.value;
 }
 if(!S.name&&!S.brief.trim()&&!S.files.length&&!S.submitted)return;
 const snapshot=structuredClone(S);
 if(snapshot.screen==='processing')snapshot.screen=S.role==='admin'?S.adminScreen:S.clientScreen;
 projectSnapshots.set(currentProjectId,snapshot);
 persistWorkspace();
}
function projectList(){
 saveCurrentProject();
 const entries=[...projectSnapshots].reverse();
 return `<h2>My Projects</h2><p class="muted">Projects saved in this browser.</p>${entries.length?`<div class="project-list">${entries.map(([id,project])=>`<button class="project-link ${id===currentProjectId?'is-current':''}" data-action="open-project" data-project-id="${id}" aria-label="Open ${e(project.name||`${project.type} project`)}">${tag(project.status,project.status==='Draft'?'gray':'')}<span class="micro">Project ${String(id).padStart(2,'0')}${id===currentProjectId?' · Current':''}</span><b>${e(project.name||`${project.type==='load'?'Load':'Generation'} project`)}</b><p>${e(project.market)} · ${e(project.type==='load'?'Load':'Generation')}</p></button>`).join('')}</div>`:'<div class="empty">No projects yet.</div>'}${!entries.length?btn('Start a project','start','primary'):''}`;
}
function openSavedProject(id){
 saveCurrentProject();
 const snapshot=projectSnapshots.get(id);
 if(!snapshot)return;
 expandedGuideDisclosures.clear();
 $('app').style.minHeight='';
 const role=S.role==='admin'&&!snapshot.submitted?'client':S.role,previousToken=S.token;
 S=structuredClone(snapshot);
 S.role=role;
 S.token=Math.max(S.token,previousToken)+1;
 currentProjectId=id;
 clearTimeout(organizeTimer);
 organizingFileIds.clear();
 organizingQueue=[];
 closePanel();
 move(role==='admin'?S.adminScreen:S.release?'packet':S.clientScreen);
}
function startNewProject(){
 saveCurrentProject();
 expandedGuideDisclosures.clear();
 const {plan,allowed,notifications,token}=S;
 S=initial();
 S.token=token+1;
 S.plan=plan;
 S.allowed=[...allowed];
 S.market=S.allowed[0]||'CAISO';
 S.notifications=notifications;
 currentProjectId=nextProjectId++;
 clearTimeout(organizeTimer);
 organizingFileIds.clear();
 organizingQueue=[];
 closePanel();
 move('intro');
}
function promptWordRects(node,words){
 const range=document.createRange();
 return words.map(({start,end})=>{
  range.setStart(node,start);
  range.setEnd(node,end);
  return [...range.getClientRects()];
 });
}
async function enterChatFromIntro(composer){
 const input=composer.querySelector('textarea');
 const start=composer.getBoundingClientRect();
 const inputRect=input.getBoundingClientRect();
 const inputStyle=getComputedStyle(input);
 const sourceStyle=getComputedStyle(composer);
 const source={backgroundColor:sourceStyle.backgroundColor,borderColor:sourceStyle.borderColor,borderRadius:sourceStyle.borderRadius};
 const inputFont={family:inputStyle.fontFamily,size:inputStyle.fontSize,weight:inputStyle.fontWeight,lineHeight:inputStyle.lineHeight,spacing:inputStyle.letterSpacing,features:inputStyle.fontFeatureSettings,variation:inputStyle.fontVariationSettings,kerning:inputStyle.fontKerning,color:inputStyle.color};
 const inputPaddingLeft=Number.parseFloat(inputStyle.paddingLeft)||0;
 const inputPaddingRight=Number.parseFloat(inputStyle.paddingRight)||0;
 const inputTextWidth=inputRect.width-inputPaddingLeft-inputPaddingRight;
 const x=inputRect.left+inputPaddingLeft;
 const y=inputRect.top+(Number.parseFloat(inputStyle.paddingTop)||0)-input.scrollTop;
 move('chat');
 const conversation=$('app').querySelector('.conversation');
 const target=conversation?.querySelector('.user-line');
 if(!target||!start.width||!start.height||!target.animate)return;
 conversation.classList.add('prompt-handoff');
 const line=target.getBoundingClientRect();
 const cardStyle=getComputedStyle(target,'::before');
 const inset=side=>Number.parseFloat(cardStyle[side])||0;
 const end={left:line.left+inset('left'),top:line.top+inset('top'),width:line.width-inset('left')-inset('right'),height:line.height-inset('top')-inset('bottom')};
 const shell=document.createElement('div');
 shell.className='prompt-flight-shell';
 shell.style.width=`${start.width}px`;
 shell.style.height=`${start.height}px`;
 shell.style.backgroundColor=source.backgroundColor;
 shell.style.borderColor=source.borderColor;
 shell.style.borderRadius=source.borderRadius;
 const sourceMeasure=document.createElement('div');
 sourceMeasure.className='prompt-word-measure';
 sourceMeasure.setAttribute('aria-hidden','true');
 sourceMeasure.textContent=S.brief;
 Object.assign(sourceMeasure.style,{
  left:`${x}px`,top:`${y}px`,width:`${inputTextWidth}px`,
  fontFamily:inputFont.family,fontSize:inputFont.size,fontWeight:inputFont.weight,
  lineHeight:inputFont.lineHeight,letterSpacing:inputFont.spacing,
  fontFeatureSettings:inputFont.features,fontVariationSettings:inputFont.variation,
  fontKerning:inputFont.kerning,textAlign:inputStyle.textAlign,
  direction:inputStyle.direction,tabSize:inputStyle.tabSize
 });
 document.body.append(sourceMeasure);
 const wordMatches=[...S.brief.matchAll(/\S+/g)];
 const wordOffsets=wordMatches.map(match=>({start:match.index,end:match.index+match[0].length}));
 const sourceRects=promptWordRects(sourceMeasure.firstChild,wordOffsets);
 const targetRects=promptWordRects(target.firstChild,wordOffsets);
 const layer=document.createElement('div');
 layer.className='prompt-flight-layer';
 layer.setAttribute('aria-hidden','true');
 const words=[];
 const segmentsToAnimate=[];
 const wordFragment=document.createDocumentFragment();
 wordOffsets.forEach((offset,index)=>{
  let segments=[{start:offset.start,end:offset.end,source:sourceRects[index][0],target:targetRects[index][0]}];
  if(sourceRects[index].length!==1||targetRects[index].length!==1){
   segments=[];
   for(const character of Array.from(S.brief.slice(offset.start,offset.end))){
    const start=segments.length?segments[segments.length-1].end:offset.start;
    const end=start+character.length;
    segments.push({start,end,source:promptWordRects(sourceMeasure.firstChild,[{start,end}])[0][0],target:promptWordRects(target.firstChild,[{start,end}])[0][0]});
   }
  }
  segments.forEach(segment=>{
   if(!segment.source||!segment.target)return;
   const word=document.createElement('span');
   word.className='prompt-flight-word';
   word.setAttribute('aria-hidden','true');
   word.textContent=S.brief.slice(segment.start,segment.end);
   Object.assign(word.style,{
    fontFamily:inputFont.family,fontSize:inputFont.size,fontWeight:inputFont.weight,
    lineHeight:inputFont.lineHeight,letterSpacing:inputFont.spacing,
    fontFeatureSettings:inputFont.features,fontVariationSettings:inputFont.variation,
    fontKerning:inputFont.kerning,color:inputFont.color
   });
   wordFragment.append(word);
   words.push(word);
   segmentsToAnimate.push(segment);
  });
 });
 layer.append(wordFragment);
 document.body.append(layer);
 const glyphRange=document.createRange();
 const positions=words.map((word,index)=>{
  glyphRange.selectNodeContents(word);
  const glyph=glyphRange.getBoundingClientRect();
  const segment=segmentsToAnimate[index];
  return {
   fromX:segment.source.left-x-glyph.left,fromY:segment.source.top-y-glyph.top,
   toX:segment.target.left-line.left-glyph.left,toY:segment.target.top-line.top-glyph.top
  };
 });
 sourceMeasure.remove();
 document.body.append(shell);
 const duration=380;
 const reflowDuration=230;
 const easing='cubic-bezier(.45,0,.2,1)';
 const animations=[
  shell.animate([
   {transform:`translate3d(${start.left}px,${start.top}px,0) scale(1)`,opacity:1,offset:0},
   {transform:`translate3d(${end.left}px,${end.top}px,0) scale(${end.width/start.width},${end.height/start.height})`,opacity:1,offset:.78},
   {transform:`translate3d(${end.left}px,${end.top}px,0) scale(${end.width/start.width},${end.height/start.height})`,opacity:0,offset:1}
  ],{duration,easing,fill:'forwards'}),
  target.animate([{opacity:0,offset:0},{opacity:0,offset:.84},{opacity:1,offset:1}],{duration,easing,fill:'forwards'}),
  layer.animate([
   {transform:`translate3d(${x}px,${y}px,0)`,opacity:1,offset:0},
   {transform:`translate3d(${line.left}px,${line.top}px,0)`,opacity:1,offset:.84},
   {transform:`translate3d(${line.left}px,${line.top}px,0)`,opacity:0,offset:1}
  ],{duration,easing,fill:'forwards'}),
  ...words.map((word,index)=>{
   const {fromX,fromY,toX,toY}=positions[index];
   return word.animate([
    {transform:`translate3d(${fromX}px,${fromY}px,0)`},
    {transform:`translate3d(${toX}px,${toY}px,0)`}
   ],{duration:reflowDuration,easing:'cubic-bezier(.32,.72,0,1)',fill:'forwards'});
  })
 ];
 const flight={shell,layer,animations,conversation};
 activePromptFlight=flight;
 await Promise.allSettled(animations.map(animation=>animation.finished));
 if(activePromptFlight!==flight)return;
 activePromptFlight=null;
 shell.remove();
 layer.remove();
 conversation.classList.remove('prompt-handoff');
 conversation.classList.add('prompt-reveal');
}
function render(){stopPromptTyping();document.body.className=S.role==='admin'?'admin':S.screen==='intro'?'intro-page':'';if(S.screen!=='intro'&&window.scrollY)window.scrollTo({top:0,behavior:'instant'});$('client-tab').className=S.role==='client'?'active':'';$('admin-tab').className=S.role==='admin'?'active':'';updateProfile();renderRail();$('app').innerHTML=guidedScreenHTML();wireDrop();persistWorkspace();}
function renderRail(){
 if(S.role==='client'&&S.screen==='intro'){$('rail').innerHTML='';return}
 const current={intro:0,chat:0,brief:0,'admin-empty':0,documents:1,waiting:1,intake:2,design:3,packet:4}[S.screen]??0;
 const completed=S.release?5:S.mapped?4:S.extracted?3:S.confirmed?2:(S.clientScreen==='documents'||S.submitted)?1:0;
 const journey=[['Brief','Describe and clarify the project'],['Documents','Share kickoff materials'],['Intake & checks','Review supplied information'],['Design','Prepare and map outputs'],['Packet','Preview and release']];
 $('rail').innerHTML=`<aside class="guide-journey" aria-label="Filing journey"><div class="guide-kicker">YOUR FILING JOURNEY</div><h2>From project brief to a reviewable packet.</h2><div class="guide-meter-copy"><span>${completed} of 5 steps complete</span><strong>${completed*20}%</strong></div><progress max="5" value="${completed}" aria-label="Filing steps complete"></progress><ol>${journey.map(([title,detail],i)=>`<li class="${i<completed?'done':i===current?'current':''}" ${i===current?'aria-current="step"':''}><span class="guide-step-number">${i<completed?'✓':String(i+1).padStart(2,'0')}</span><span class="guide-step-copy"><b>${title}</b><small>${detail}</small></span>${i===current?'<em>Now</em>':''}</li>`).join('')}</ol><p class="guide-journey-note">Follow the conversation to take the next step.</p></aside>`;
}
function guideDisclosure(id,label,content){
 const open=expandedGuideDisclosures.has(id);
 return `<div class="guide-disclosure ${open?'is-open':''}"><button type="button" class="guide-disclosure-trigger" aria-expanded="${open}" aria-controls="${id}"><span>${e(label)}</span><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="guide-disclosure-panel" id="${id}" aria-hidden="${!open}" ${open?'':'inert'}><div class="guide-disclosure-inner">${content}</div></div></div>`;
}
function guidedHistoryHTML(){
 const order={intro:0,chat:1,brief:2,documents:3,waiting:4,intake:5,design:6,packet:7};
 const current=order[S.screen]??0;
 if(current<2||!S.brief)return '';
 let history=agent('<p>Tell us what you need. Start with your project in your own words.</p>')+user();
 for(const [key,label] of guidedPrompts())if(S.answers[key])history+=agent(`<p>${e(label)}</p>`)+`<div class="user-line answer-line">${e(S.answers[key])}</div>`;
 if(current>=3){
  const values=projectValues(S).map(([label,value])=>`<div class="brief-row"><span class="micro">${e(label)}</span><b>${e(value)}</b></div>`).join('');
  history+=agent(`<p>Here is the brief. I’ve carried your answers forward and kept the unknowns visible.</p>${guideDisclosure('guide-history-brief','View project brief',`<div class="brief">${values}</div>`)}`);
 }
 if(current>=4&&S.files.length){
  history+=`<div class="user-line answer-line">Submitted ${S.files.length} kickoff material${S.files.length===1?'':'s'} for team review.</div>`;
  history+=agent(`<p>Received. The project is with the GridPilot team for review.</p>${guideDisclosure('guide-history-materials','View submitted materials',`<div class="guide-history-list">${S.files.map(file=>`<div><span>${e(file.category)}</span><b>${e(file.name)}</b></div>`).join('')}</div>`)}`);
 }
 if(current>=6&&S.extracted){
  const intake=projectValues(S).filter((_,index)=>[0,3,4,5].includes(index)).map(([label,value])=>`<div><span>${e(label)}</span><b>${e(value)}</b></div>`).join('');
  history+=agent(`<p>Intake & checks brought the brief, answers and materials together. Review notes and unknowns remain visible for the team.</p>${guideDisclosure('guide-history-intake','View intake review',`<div class="guide-history-list">${intake}</div>`)}`);
 }
 if(current>=7){
  const visible=(S.role==='client'&&S.release?S.release.outputs:S.outputs).filter(output=>output.visible);
  const mapped=visible.map(output=>`<div><span>${e(output.section)}</span><b>${e(output.name)}</b></div>`).join('');
  history+=agent(`<p>The engineering design is a draft; external verification is still pending. ${visible.length} client-visible output${visible.length===1?' is':'s are'} mapped into the packet.</p>${visible.length?guideDisclosure('guide-history-outputs','View mapped outputs',`<div class="guide-history-list">${mapped}</div>`):''}`);
 }
 history+=S.guideNotes.filter(note=>note.screen!==S.screen).map(note=>guidedNoteHTML(note)).join('');
 return `<div class="guide-history">${history}</div>`;
}
function guidedNoteHTML(note,isLatest=false){return `<div class="user-line guide-note-line">${e(note.text)}</div>${isLatest&&replyPending&&replyKind==='note'?typingAgent():agent('<p>I’ve saved that in this conversation. Continue with the options above when you’re ready.</p>',isLatest&&replyRevealing&&replyKind==='note'?'guide-reveal':'')}`}
function guidedCurrentNotesHTML(){const notes=S.guideNotes.filter(note=>note.screen===S.screen);return notes.map((note,index)=>guidedNoteHTML(note,index===notes.length-1)).join('')}
function guidedActionHTML(){
 const actions={brief:'Build the brief',documents:S.role==='admin'?'Review submitted materials':'Set up the filing',intake:'Confirm materials and continue',design:'Continue to design',packet:S.role==='client'?'Open the project packet':'Build the packet preview','admin-empty':'Open the administrator workspace'};
 return actions[S.screen]?`<div class="user-line guide-action-line">${actions[S.screen]}</div>`:'';
}
function guideComposerHTML(){return `<form class="guide-composer-dock" id="guide-composer-form"><div class="guide-composer"><label class="sr-only" for="guide-input">Message GridPilot AI</label><textarea id="guide-input" rows="1" placeholder="Message GridPilot AI…" aria-label="Message GridPilot AI">${e(S.guideDraft)}</textarea><button type="submit" class="guide-composer-send" aria-label="Send message">${sendIcon}</button></div></form>`}
function sendGuideMessage(){
 const value=$('guide-input')?.value.trim();
 if(!value)return;
 const previousY=conversationScrollTop();
 S.guideDraft='';
 let replyType='note';
 if(S.screen==='chat'){
  const next=guidedPrompts().find(([key])=>!S.answers[key]);
  if(next){S.answers[next[0]]=value;replyType='chat'}
  else S.guideNotes.push({screen:S.screen,text:value});
 }else S.guideNotes.push({screen:S.screen,text:value});
 startAssistantReply(replyType,previousY,()=>$('guide-input')?.focus({preventScroll:true}));
 requestAnimationFrame(()=>$('guide-input')?.focus({preventScroll:true}));
}
function guidedInlinePromptHTML(){
 if(replyPending&&replyKind==='inline')return `<div class="guide-inline-prompt">${typingAgent()}</div>`;
 const reveal=replyRevealing&&replyKind==='inline'?' guide-reveal':'';
 if(panelKind==='request-materials')return `<div class="guide-inline-prompt${reveal}">${agent(`<p class="guide-reply-lead">What materials are missing?</p><p class="muted">Write a short request for the client.</p><label>Requested materials<textarea id="missing-value">${e(S.missing)}</textarea></label><div class="actions">${btn('Cancel','close-panel','quiet')}${btn('Send sample request','send-request','primary')}</div><p class="flow-caption">Updates the prototype only. No email is sent.</p>`)}</div>`;
 if(panelKind==='release-review')return `<div class="guide-inline-prompt${reveal}">${agent(`${conversationalize(releaseReview())}<div class="actions">${btn('Back to packet','close-panel','quiet')}</div>`)}</div>`;
 return '';
}
function conversationalize(content){
 if(S.screen==='documents'){
  const message=S.role==='admin'
   ?`I’ve received ${S.files.length} material${S.files.length===1?'':'s'} for ${e(S.name)} in ${e(S.market)}. Review them, request anything missing, or confirm to continue.`
   :'Next, add your kickoff documents. Drop the folder below and I’ll organize what’s inside.';
  content=content.replace(/<div class="eyebrow">Step 1 of 4<\/div><h2>[^<]*<\/h2><p class="muted">[^<]*<\/p>/,`<p class="guide-reply-lead">${message}</p>`);
 }
 if(S.screen==='intake')content=content.replace(/<div class="eyebrow">Step 2 of 4<\/div><h2>Intake & checks<\/h2><p class="muted">[^<]*<\/p>/,'<p class="guide-reply-lead">I’ve brought your brief, answers and materials together for intake review.</p>');
 if(S.screen==='design')content=content.replace(/<div class="eyebrow">Step 3 of 4<\/div><h2>Engineering design<\/h2><p class="muted">[^<]*<\/p>/,'<p class="guide-reply-lead">Here’s the engineering draft based on your project brief. External verification is still pending.</p>');
 if(S.screen==='packet')content=content.replace(`<h1>${e(S.market)} project packet</h1>`,`<p class="guide-reply-lead">Here is the ${e(S.market)} project packet.</p>`);
 return content
  .replace('<h1>Tell us what you need</h1>','<p class="guide-reply-lead">Tell me about your project in your own words. I’ll ask for what’s missing.</p>')
  .replace(/<(?:div|span)\b[^>]*class="[^"]*\beyebrow\b[^"]*"[^>]*>[^<]*<\/(?:div|span)>/g,'')
  .replace(/<h[1-3](?: [^>]*)?>/g,'<p class="guide-reply-lead">')
  .replace(/<\/h[1-3]>/g,'</p>');
}
function guidedScreenHTML(){
 if(S.screen==='intro')return `<div class="guide-thread"><div class="guide-current">${intro()}</div></div>`;
 const content=conversationalize(screenHTML());
 if(S.screen==='chat')return `<div class="guide-thread"><div class="guide-current">${agent('<p>Tell us what you need. Start with your project in your own words.</p>')}${content}</div>${guidedCurrentNotesHTML()}</div>${guideComposerHTML()}`;
 const pendingStage=replyPending&&replyKind==='stage';
 const stageReveal=replyRevealing&&replyKind==='stage'?' guide-reveal':'';
 if(S.screen==='brief')return `<div class="guide-thread">${guidedHistoryHTML()}${guidedActionHTML()}<div class="guide-current${stageReveal}">${pendingStage?typingAgent():content.replace(user(),'')}</div>${guidedCurrentNotesHTML()}</div>${guideComposerHTML()}`;
 const inline=guidedInlinePromptHTML();
 const inlineAction=inline?`<div class="user-line guide-action-line">${panelKind==='request-materials'?'Request more materials':'Review and publish the packet'}</div>`:'';
 return `<div class="guide-thread">${guidedHistoryHTML()}${guidedActionHTML()}<div class="guide-current${stageReveal}">${pendingStage?typingAgent():agent(content)}</div>${guidedCurrentNotesHTML()}${inlineAction}${inline}</div>${guideComposerHTML()}`;
}
function intro(){return `<section class="hero arrive">
  <h1>Tell us what you need</h1>
  <div class="setup" aria-label="Project type and market">
    <div class="setup-group" role="group" aria-label="Project type">
      <span class="setup-label micro">Project type</span>
      <div class="setup-options">
        ${btn('Load','type',`pill ${S.type==='load'?'selected':''}`,false,`data-type="load" aria-pressed="${S.type==='load'}"`)}
        ${btn('Generation','type',`pill ${S.type==='generation'?'selected':''}`,false,`data-type="generation" aria-pressed="${S.type==='generation'}"`)}
        ${btn('Modification · soon','type','pill',true)}
      </div>
    </div>
    <div class="setup-group setup-market" role="group" aria-label="Market">
      <span class="setup-label micro">Market</span>
      ${btn(`${e(S.market||'Choose market')}<svg class="market-chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,'markets','pill',false,'aria-haspopup="dialog" aria-expanded="false"')}
    </div>
  </div>
  <div class="composer">
    <textarea id="brief-input" aria-label="Describe the project in your own words" placeholder="Describe the project in your own words. GridPilot AI asks for what’s missing.">${e(S.brief)}</textarea>
    <div class="composer-bottom">
      <span class="micro">${S.plan==='Demo'?'Demo access · one market':'Annual access'}</span>
      ${btn(sendIcon,'send','send',!S.allowed.includes(S.market),'aria-label="Continue to questions"')}
    </div>
  </div>
  <div class="examples-group" role="group" aria-label="Sample requests">
    <div class="examples">${(S.type==='generation'?['Solar + storage packet','Interconnection request','Technical data & models']:['Data center connection','Phased load project','On-site generation']).map((x,i)=>btn(`${S.market} ${x}`,'example',S.example&&S.exampleIndex===i?'selected':'',false,`data-example="${i}" aria-pressed="${S.example&&S.exampleIndex===i}"`)).join('')}</div>
  </div>
</section>`}
function question(key,text,choices){return `<div class="question ${S.answers[key]?'resolved':''}"><p>${text}</p><div class="chips">${choices.map(c=>btn(e(c),'answer',S.answers[key]===c?'selected':'',false,`data-key="${key}" data-value="${e(c)}"`)).join('')}</div></div>`}
function guidedPrompts(){return [
  ['track',S.type==='load'?'What would you like us to prepare?':'Which study track are you targeting?',S.type==='load'?['Full connection package','Review existing materials','GridPilot to advise']:['Cluster study','Independent Study Process','Fast Track','GridPilot to advise']],
  ['schedule','When do you plan to move forward?',['This quarter · COD 2028','COD 2029','No deadline yet']],
  ['poi','Do you have a point of interconnection?',S.example?['Whirlwind Substation · 230 kV','Shortlist of two','Not decided yet']:['Confirmed POI','Shortlist of two','Not decided yet']]
 ];}
function chat(){
 const prompts=guidedPrompts();
 const waitingForQuestion=replyPending&&replyKind!=='note';
 const revealingQuestion=replyRevealing&&replyKind!=='note';
 let conversation=user();
 for(let i=0;i<prompts.length;i++){
  const [key,label,choices]=prompts[i];
  const opening=i===0?`<p>Got it — a ${e(S.market)} ${S.type==='generation'?'generation':'load'} project. I’ll ask three things before I set up the ${S.type==='load'?'project':'filing'}.</p>`:'';
  if(!S.answers[key]){
   conversation+=waitingForQuestion?typingAgent():agent(`${opening}${question(key,label,choices)}`,revealingQuestion?'guide-reveal':'');
   break;
  }
  conversation+=agent(`${opening}<p>${label}</p><details class="guide-edit-answer"><summary>Change answer</summary><div class="chips">${choices.map(choice=>btn(e(choice),'answer',S.answers[key]===choice?'selected':'',false,`data-key="${key}" data-value="${e(choice)}"`)).join('')}</div></details>`)+`<div class="user-line answer-line">${e(S.answers[key])}</div>`;
 }
 if(prompts.every(([key])=>S.answers[key]))conversation+=waitingForQuestion?typingAgent():agent(`<p>That gives me enough to prepare your brief. I’ll carry forward what you know and leave the gaps visible for the team.</p><div class="guide-next">${btn('Build the brief','build-brief','primary')}</div>`,revealingQuestion?'guide-reveal':'');
 return `<section class="conversation">${conversation}<div class="guide-back">${btn('Edit project description','back-intro','quiet')}</div></section>`;
}
function projectValues(p=S){let mw=p.fields.capacity||'';return [['ISO / MARKET',p.market],['PROJECT',p.name||`${p.type==='load'?'Load':'Generation'} project`],['CAPACITY',mw?`${mw} MW · client-stated`:'Not provided · team to advise'],[p.type==='load'?'REQUEST':'TRACK PREFERENCE',p.answers.track||'GridPilot to advise'],['DEADLINE · COD',p.answers.schedule||'Not sure'],['POI',p.answers.poi||'Not decided'],['DELIVERABLE',p.type==='load'?'Load interconnection package':'Interconnection submission packet']]}
function briefHTML(){return `<section class="conversation brief-page">${user()}${agent('<p>Here is the brief.</p><p class="muted">I’ve carried your answers forward. Add anything you know; we’ll handle the gaps.</p>')}${guideDisclosure('guide-project-brief','View project brief',`<div class="brief arrive">${projectValues().map(([k,v],i)=>`<div class="brief-row"><span class="micro">${k}</span><b data-brief-value="${i}">${e(v)}</b></div>`).join('')}</div>`) }<details class="small-gap" data-refine-project><summary>Refine the project <span class="micro">Optional</span></summary><div class="detail-body field-grid"><label>Project name<input data-field="name" value="${e(S.name)}" autocomplete="off"></label><label>${S.type==='load'?'Requested load':'Requested capacity'} (MW)<input type="number" min="0" step="any" inputmode="decimal" data-field="capacity" value="${e(S.fields.capacity||'')}" placeholder="Not sure" aria-describedby="capacity-error"><small class="field-error" id="capacity-error" role="alert" hidden>Enter a number above 0, or leave this blank.</small></label><label>Legal entity<input data-field="legal_entity" value="${e(S.fields.legal_entity||'')}" placeholder="e.g. Example Energy LLC"></label><label>Primary contact<input data-field="contact" value="${e(S.fields.contact||'')}" placeholder="e.g. Jane Lee · jane@example.com"></label></div></details>${intakeDetails()}<p class="flow-caption">Study-track eligibility is confirmed by the GridPilot team.</p><div class="brief-actions"><span class="micro">Next: upload the kickoff documents</span>${btn('Change answers','chat','quiet')}${btn('Set up the filing','setup','primary')}</div></section>`}
function intakeDetails(){const survey=SURVEYS.find(x=>x.key===S.type);return `<details><summary>Anything else you already know? <span class="micro">Optional</span></summary><div class="detail-body">${survey.sections.filter(x=>!x.title.includes('basics')).map(g=>`<details><summary>${e(g.title.replace(/^\d+ · /,''))}</summary><div class="detail-body field-grid">${g.fields.filter(f=>f.type!=='readonly').map(f=>{let control=f.options.length?`<select data-survey="${f.id}"><option value="">Not sure / skip</option>${f.options.map(o=>`<option ${S.fields[f.id]===o?'selected':''}>${e(o)}</option>`).join('')}</select>`:f.type==='textarea'?`<textarea data-survey="${f.id}" rows="4" placeholder="${e(fieldExample(f))}">${e(S.fields[f.id]||'')}</textarea>`:`<input data-survey="${f.id}" type="${f.type==='number'?'number':f.type==='date'?'date':'text'}" ${f.type==='number'?'min="0" step="any" inputmode="decimal"':''} value="${e(S.fields[f.id]||'')}" placeholder="${e(fieldExample(f))}">`;return `<label class="${f.type==='repeat'?'full':''}">${e(f.label)}${control}${f.show_when!=='Always'?`<small class="muted">Only if: ${e(f.show_when)}</small>`:''}${f.type==='repeat'?`<small class="muted">${e(f.note)}</small>`:''}</label>`}).join('')}</div></details>`).join('')}<a href="Survey_Explorer_Edit.html" target="_blank">Full survey specification ↗</a></div></details>`}
const FIELD_EXAMPLES={
  site_location:'e.g. Bakersfield, CA',site_count:'e.g. 2',poi_substation:'e.g. Whirlwind Substation',poi_owner:'e.g. PG&E',poi_bus:'e.g. 12345',poi_voltage:'e.g. 230',line_length:'e.g. 2.5',
  service_capacity:'e.g. 125',max_export:'e.g. 125',max_import:'e.g. 25',solar_dc:'e.g. 150',solar_ac:'e.g. 125',bess_charge:'e.g. 50',bess_discharge:'e.g. 50',bess_nameplate:'e.g. 200',bess_usable:'e.g. 180',bess_duration:'e.g. 4',aux_load:'e.g. 2',losses:'e.g. 1.5',
  inverter_make:'e.g. SMA',inverter_model:'e.g. Manufacturer model number',model_vendor:'e.g. Model provider',model_equipment:'e.g. Inverter model',model_version:'e.g. v2.1',
  building_count:'e.g. 3',buildings:'e.g. Building A · 40 MW · 13.8 kV',site_gross:'e.g. 120',load_losses:'e.g. 2',requested_load:'e.g. 120',power_factor:'e.g. 0.98',load_mix:'e.g. IT 70%, cooling 20%, other 10%',equipment_configs:'e.g. 4 generators · 15 MW each',
  assumption_values:'e.g. The POI is still under utility review.',notes:'e.g. The utility expects to confirm the POI next month.'
};
function fieldExample(f){if(f.type==='date')return '';if(f.type.includes('file'))return 'Add later in Documents';if(f.id==='phases')return S.type==='load'?'e.g. Phase 1 · 40 MW · 2029':'e.g. Phase 1 · 60 MW · Q3 2028';return FIELD_EXAMPLES[f.id]||'e.g. Add a short detail'}
function categories(){return S.type==='load'?['Load data workbook','Site / POI map','Equipment schedule','Supporting documents']:['Site control','Technical data workbook','BESS specifications','Authorized signatory','Dynamic model','Project boundary','Base case']}
function fileNameCell(file){
 if(!organizingFileIds.has(file.id))return `<span class="file-name">${e(file.name)}</span>`;
 return organizingQueue[0]===file.id?'<span class="file-loading"><span class="file-loading__spinner" aria-hidden="true"></span>Sorting…</span>':'<span class="file-queued">Waiting…</span>';
}
function fileRows(){return S.files.length?S.files.map((f,i)=>`<div class="file-row" data-file-id="${e(f.id)}"><div>${e(f.category)}<div class="micro">${f.sample?'Demo sample':'Selected locally'}</div></div><div class="filename">${fileNameCell(f)}</div>${S.role==='admin'?tag('Received'):S.submitted?tag('Received'):btn('Remove','remove-file','',false,`data-i="${i}"`)}</div>`).join(''):categories().map(c=>`<div class="file-row"><span>${c}</span><span class="filename muted">Add if available</span>${tag('Not provided','gray')}</div>`).join('')}
function uploadDropzone(){return `<div class="dropzone" id="dropzone"><div class="drop-icon">↥</div><p>Drop your project files here</p><p class="micro">ZIP · workbooks · vendor files · drawings</p>${btn('Choose files','choose-files')}${btn('Use demo kickoff folder','sample-files','quiet')}<input id="file-picker" type="file" multiple hidden></div>`}
function documents(){let admin=S.role==='admin';return `<section class="frame arrive"><div class="eyebrow">Step 1 of 4</div><h2>${admin?'The project is here.':'Kickoff documents'}</h2><p class="muted">${admin?`${e(S.name)} · Example Energy · ${e(S.market)}`:'Drop the kickoff folder. We’ll organize what’s inside.'}</p>${admin?`<div class="compact-bar ${S.confirmed?'':'amber'}"><p>${S.files.length} material${S.files.length===1?'':'s'} received · ${e(S.status)}</p>${tag(S.confirmed?'Materials confirmed':'Review pending',S.confirmed?'':'amber')}</div>`:!S.submitted?uploadDropzone():`<div class="compact-bar"><p>Your submitted snapshot</p>${tag('Received')}</div>`}<div data-file-list>${fileRows()}</div>${admin?`<details class="project-intake-details"><summary><span>Project brief and intake</span>${detailsChevron}</summary><div class="detail-body">${projectValues().map(([k,v])=>`<div class="publish-check"><span class="micro">${k}</span><span>${e(v)}</span></div>`).join('')}</div></details><div class="actions">${btn('Request materials','request-materials','quiet')}${btn(S.confirmed?'Read the intake':'Confirm materials & continue','confirm','primary',!S.submitted||!S.files.length)}</div>`:!S.submitted?`<p class="flow-caption" data-upload-caption role="status">${organizingFileIds.size?'Sorting selected files…':S.files.length?'Your team will review the materials after you submit.':'Upload at least one file to enable submission.'}</p><div class="actions">${btn('Back to brief','brief','quiet')}${btn('Submit for team review','submit','primary',!S.files.length||organizingFileIds.size>0)}</div>`:`<div class="actions">${btn('Back to project','waiting','primary')}</div>`}</section>`}
function waiting(){if(S.status==='Action needed')return `<section class="frame arrive"><div class="eyebrow">Step 1 of 4</div><h2>A few items are missing.</h2><p class="muted">${e(S.missing)} Upload what you have; we’ll help with the rest.</p>${uploadDropzone()}<div data-file-list>${fileRows()}</div><p class="flow-caption" data-upload-caption role="status">${organizingFileIds.size?'Sorting selected files…':''}</p><div class="actions">${btn('Resubmit materials','resubmit','primary',!S.files.length||organizingFileIds.size>0)}</div></section>`;return `<section class="waiting arrive"><div class="seal">✓</div><span class="eyebrow">${e(S.status)}</span><h1>Your project is with us.</h1><p>GridPilot team will review your materials and get back to you within 24 business hours.</p><p>We’ll email you once we confirm that we have received all required materials.</p>${S.confirmed?'<div class="compact-bar"><p>Materials confirmed. Your team is on it.</p></div>':''}<div class="receipt"><span class="done">✓ Submitted</span><span class="${S.confirmed?'done':''}">${S.confirmed?'✓ ':''}Team review</span><span>Results</span></div><div class="actions">${btn('View submitted materials','documents','quiet')}${S.release?btn('Open your results','packet','quiet'):''}${btn('Submit another project','new-project','primary')}</div></section>`}
function checks(){let p=activeProject(),admin=S.role==='admin';return `<section class="frame arrive"><div class="eyebrow">Step 2 of 4</div><h2>Intake & checks</h2><p class="muted">Your brief, answers and materials — brought together.</p><div class="compact-bar ${S.example?'review':'amber'}"><p>${S.example?'Sample fields organized · source context retained':'Client-entered information · document extraction pending'}</p>${tag('Intake review',S.example?'review':'amber')}</div>${['Legal & Corporate','Site Control','Interconnection Intent','Project Technical Parameters','Equipment & Vendor','Design Preferences'].map((g,i)=>`<details class="intake-accordion" ${i===2?'open':''}><summary><span>${g}</span>${tag(i===2?'Client supplied':'Review notes',i===2?'':'gray')}${detailsChevron}</summary><div class="detail-body">${i===2?projectValues(p).filter((_,j)=>[0,3,4,5].includes(j)).map(([k,v])=>`<div class="publish-check"><span class="micro">${k}</span><span>${e(v)}</span></div>`).join(''):i===3?`<label>Client-stated capacity (MW)<input value="${e(p.fields.capacity||'Not provided')}" readonly></label><p class="micro">Source: client brief · ${S.example?'demo values':'not engineering-validated'}</p>`:`<p class="muted">${i===0?e(p.fields.legal_entity||'Legal entity to be confirmed'):i===1?'Supporting site evidence requires team review.':i===4?'Equipment specifications and models require verification.':'Use client-provided preferences; propose missing details.'}</p>`}</div></details>`).join('')}<p class="flow-caption">An acknowledged assumption is not an engineering approval.</p>${admin?`<div class="actions">${btn('Back','documents','quiet')}${btn('Continue to design','design','primary')}</div>`:`<div class="actions">${btn('View design','design','primary')}</div>`}</section>`}
function topology(){return `<div class="diagram"><div class="diagram-head"><span class="micro">Project single-line drawing</span>${tag('Illustrative draft','gray')}</div><svg viewBox="0 0 850 280" role="img" aria-label="Illustrative generation and storage single-line topology, not an engineering deliverable"><defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#edf0f4" stroke-width=".5"/></pattern></defs><rect width="850" height="280" fill="url(#grid)"/><g class="wire"><path d="M115 85V142H425V142H700V80M255 85V142M425 220V142M565 85V142"/><path d="M700 80H740M700 70V90M692 70V90"/><path d="M115 65v20m140-20v20m310-20v20"/><circle cx="480" cy="142" r="14"/><circle cx="498" cy="142" r="14"/></g><g class="node"><rect x="85" y="32" width="60" height="35" rx="3" fill="#edf2f6" stroke="#597086"/><rect x="225" y="32" width="60" height="35" rx="3" fill="#edf2f6" stroke="#597086"/><rect x="535" y="32" width="60" height="35" rx="3" fill="#edf2f6" stroke="#597086"/><rect x="398" y="220" width="54" height="28" rx="3" fill="#eaf0ec" stroke="#638570"/><text x="86" y="22">${S.type==='load'?'LOAD A':'PV BLOCK A'}</text><text x="225" y="22">${S.type==='load'?'LOAD B':'PV BLOCK B'}</text><text x="544" y="22">STORAGE</text><text x="659" y="52">UTILITY POI</text><text x="391" y="267">AUXILIARY</text><text x="170" y="171">COLLECTOR BUS</text><text x="461" y="177">MAIN XFMR</text><text x="588" y="245">TOPOLOGY PREVIEW · NOT TO SCALE</text></g></svg></div>`}
function design(){const admin=S.role==='admin'&&!S.preview;return `<section class="frame arrive"><div class="eyebrow">Step 3 of 4</div><h2>Engineering design</h2><p class="muted">From the project brief to a reviewable engineering package.</p><div class="compact-bar draft"><p>Engineering draft · external verification pending.</p>${tag('Draft','gray')}</div><div class="stats design-stats"><div class="stat"><b>${e(activeProject().fields.capacity||'—')}</b><small>Client-stated MW</small></div><div class="stat"><b>${e(S.market)}</b><small>Market</small></div><div class="stat"><b>${S.outputs.length||S.release?.outputs.length||0}</b><small>Prepared outputs</small></div></div>${guideDisclosure('guide-engineering-draft','View engineering draft',`${topology()}<p class="flow-caption">Illustrative topology only. The production view must use the team’s reviewed project drawing.</p>`) }${admin?`<div class="card outputs-card"><h3>Prepare the client outputs</h3><p class="muted">Upload, then place each file in the right step.</p>${btn('Choose output files','choose-outputs')}${btn('Use sample work products','sample-outputs','quiet')}<input type="file" id="output-picker" multiple hidden>${outputMapping()}${S.outputs.length?`<div class="actions">${btn(S.mapped?'Mapping confirmed':'Confirm section mapping','confirm-map','primary')}</div>`:''}</div><div class="actions">${btn('Back','intake','quiet')}${btn('Build the packet preview','build-packet','primary',!S.mapped)}</div>`:`<div class="actions">${btn('Open packet','packet','primary')}</div>`}</section>`}
function outputMapping(){return S.outputs.length?`<div class="table-scroll"><table><thead><tr><th>OUTPUT</th><th>CLIENT SECTION</th><th>VISIBILITY</th></tr></thead><tbody>${S.outputs.map((f,i)=>`<tr><td>${e(f.name)}<div class="micro">${f.sample?'Demo placeholder':'Selected locally'}</div></td><td><select data-map="${i}" aria-label="Section for ${e(f.name)}">${sections.map(sec=>`<option ${sec===f.section?'selected':''}>${sec}</option>`).join('')}</select></td><td><select data-visibility="${i}" aria-label="Visibility for ${e(f.name)}"><option ${f.visible?'selected':''}>Client</option><option ${!f.visible?'selected':''}>Internal only</option></select></td></tr>`).join('')}</tbody></table></div>`:''}
function outputList(outputs,section){const files=outputs.filter(f=>f.visible&&f.section===section);return files.length?files.map((f,i)=>`<div class="output-row"><div>${e(f.name)}<small>${f.sample?'Demo placeholder · sample contents only':'Local file · selected in this browser'}</small></div>${tag('Draft','gray')}${btn(f.sample?'Sample download':'Download','download-output','small-button',S.preview,`data-fileid="${e(f.id)}"`)}</div>`).join(''):'<p class="muted">Not included in this release.</p>'}
function packet(){const admin=S.role==='admin',r=S.release,outputs=admin?S.outputs:(r?.outputs||[]);if(!admin&&!r)return waiting();const count=outputs.filter(f=>f.visible).length;return `<section class="frame arrive">${S.preview?`<div class="preview-band"><span>Client preview · unpublished draft</span>${btn('Exit preview','exit-preview')}</div>`:''}<div class="eyebrow" style="margin-top:24px">Step 4 of 4</div><div class="package-hero"><div><h1>${e(S.market)} project packet</h1><p class="muted">${admin?'Draft ready for review':`Release v${r.version} · ready to download`} — ${count} work products</p></div><div class="package-icon">▤</div></div><div class="compact-bar draft"><p>Engineering draft · review pending.</p>${tag('Draft','gray')}</div><div class="stats"><div class="stat"><b>${e(activeProject().fields.capacity||'—')}</b><small>Requested MW</small></div><div class="stat"><b>${e(S.type==='load'?'Load':'Generation')}</b><small>Project type</small></div><div class="stat"><b>${e(S.market)}</b><small>Market</small></div></div>${sections.map((sec,i)=>`<details ${i===3?'open':''}><summary><span>${String(i+1).padStart(2,'0')} · ${sec}</span><span class="micro">${outputs.filter(f=>f.visible&&f.section===sec).length} files</span></summary><div class="detail-body">${outputList(outputs,sec)}</div></details>`).join('')}<p class="flow-caption">The packet follows the same order as the project. Internal-only files stay private.</p>${admin?S.preview?`<div class="actions">${btn('Approve this preview','approve-preview','primary')}</div>`:`<div class="actions">${btn('Back to design','design','quiet')}${btn('Preview as client','preview')}${btn('Review & publish','release-review','primary',!S.previewed)}</div>`:`<div class="actions">${btn('Download packet (.zip)','download-packet','primary')}</div>`}</section>`}
function screenHTML(){if(S.screen==='admin-empty')return `<section class="conversation"><div class="empty"><div class="eyebrow">Administrator workspace</div><h2>Your project inbox.</h2><p class="muted">Your inbox is empty. New project submissions will appear here.</p></div></section>`;if(S.screen==='intro')return intro();if(S.screen==='chat')return chat();if(S.screen==='brief')return briefHTML();if(S.screen==='documents')return documents();if(S.screen==='waiting')return waiting();if(S.screen==='intake')return checks();if(S.screen==='design')return design();if(S.screen==='packet')return packet();return ''}
async function processScene(title,steps,next){
  move(next);
}
function stopPromptTyping(finish=false){
  if(typingFrame)cancelAnimationFrame(typingFrame);
  typingFrame=0;
  if(finish&&typingInput)typingInput.value=S.brief;
  typingInput=null;
}
function typePrompt(input,text){
  stopPromptTyping();
  const characters=Array.from(text);
  if(characters.length<2){input.value=text;return}
  input.value=characters[0];
  typingInput=input;
  const start=performance.now();
  const duration=Math.min(900,Math.max(550,characters.length*5));
  const frame=now=>{
    if(typingInput!==input)return;
    const count=Math.min(characters.length,Math.max(1,Math.ceil((now-start)/duration*characters.length)));
    input.value=characters.slice(0,count).join('');
    if(count<characters.length)typingFrame=requestAnimationFrame(frame);
    else{input.value=text;typingFrame=0;typingInput=null}
  };
  typingFrame=requestAnimationFrame(frame);
}
function loadExample(index=0,motion=false){S.example=true;S.exampleIndex=index;S.name=S.type==='load'?'Example Data Center':'Example Solar + Storage';S.fields.capacity=S.type==='load'?'120':'125';S.brief=S.type==='load'?`We’re planning a 120 MW data center in ${S.market}. We need a load interconnection package, with capacity added in phases.`:`We’re filing an interconnection request with ${S.market} for a 125 MW solar + storage project in Kern County. We need the full submission packet.`;if(index===1){S.name=S.type==='load'?'Phased Load Project':'New Generation Request';S.fields.capacity='';S.brief=S.type==='load'?`We’re planning a phased load connection in ${S.market}. Help us prepare the intake and identify the materials we need.`:`We need to prepare an interconnection request for a new generation project in ${S.market}. Help us identify the right path and materials.`}if(index===2){S.name=S.type==='load'?'Load with On-site Generation':'Technical Data & Models';S.fields.capacity='';S.brief=S.type==='load'?`We’re connecting a new load in ${S.market} with supporting on-site generation. We need help with the equipment and model information.`:`We have equipment data and vendor models for a generation project in ${S.market}. We need help preparing the technical data and model package.`}S.answers={};
  const input=$('brief-input');
  const animateText=motion&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(input){
    if(animateText)typePrompt(input,S.brief);
    else{stopPromptTyping();input.value=S.brief}
  }
  for(const button of $('app').querySelectorAll('.examples button[data-example]')){
    const active=Number(button.dataset.example)===index;
    button.classList.toggle('selected',active);
    button.setAttribute('aria-pressed',String(active));
  }
  persistWorkspace();
}
function refreshFileUploadStatus(){
 const caption=$('app').querySelector('[data-upload-caption]');
 if(caption)caption.textContent=organizingFileIds.size?'Sorting selected files…':S.screen==='documents'?S.files.length?'Your team will review the materials after you submit.':'Upload at least one file to enable submission.':'';
 const submit=$('app').querySelector('[data-action="submit"], [data-action="resubmit"]');
 if(submit)submit.disabled=!S.files.length||organizingFileIds.size>0;
}
function refreshFileTable(){
 const list=$('app').querySelector('[data-file-list]');
 if(!list)return;
 list.innerHTML=fileRows();
 refreshFileUploadStatus();
}
function sortNextFile(){
 const id=organizingQueue[0];
 if(!id)return;
 if(!organizingFileIds.has(id)){organizingQueue.shift();sortNextFile();return}
 const row=[...($('app').querySelectorAll('[data-file-id]'))].find(item=>item.dataset.fileId===id);
 const cell=row?.querySelector('.filename');
 if(cell)cell.innerHTML='<span class="file-loading"><span class="file-loading__spinner" aria-hidden="true"></span>Sorting…</span>';
 organizeTimer=setTimeout(()=>{
  organizingQueue=organizingQueue.filter(fileId=>fileId!==id);
  organizingFileIds.delete(id);
  const file=S.files.find(item=>item.id===id);
  const list=$('app').querySelector('[data-file-list]');
  const row=[...(list?.querySelectorAll('[data-file-id]')||[])].find(item=>item.dataset.fileId===id);
  const nameCell=row?.querySelector('.filename');
  if(file&&nameCell){
   const name=document.createElement('span');
   name.className='file-name file-name-enter';
   name.textContent=file.name;
   nameCell.replaceChildren(name);
  }
  refreshFileUploadStatus();
  sortNextFile();
 },260);
}
function organizeFilesInline(ids,replace=false){
 clearTimeout(organizeTimer);
 if(replace){organizingFileIds.clear();organizingQueue=[]}
 ids.forEach(id=>{if(!organizingFileIds.has(id)){organizingFileIds.add(id);organizingQueue.push(id)}});
 refreshFileTable();
 persistWorkspace();
 sortNextFile();
}
function sampleFiles(){S.files.filter(file=>!file.sample).forEach(file=>{liveFiles.delete(file.id);removeStoredFile(file.id)});S.files=(S.type==='load'?[['Example_Load_Data.xlsx','Load data workbook'],['Example_Site_Map.pdf','Site / POI map'],['Example_Equipment_Schedule.xlsx','Equipment schedule']]:[['Example_Executed_Lease.pdf','Site control'],['Example_Technical_Data.xlsx','Technical data workbook'],['Example_BESS_Specification.pdf','BESS specifications'],['Example_Signatory_Authority.pdf','Authorized signatory'],['Example_Vendor_Model.dyd','Dynamic model'],['Example_Boundary.kmz','Project boundary'],['Example_Base_Case.epc','Base case']]).map(([name,category],i)=>({id:`input-${i}`,name,category,sample:true}));organizeFilesInline(S.files.map(file=>file.id),true)}
function classify(n){n=n.toLowerCase();if(/lease|deed|site.control/.test(n))return 'Site control';if(/\.dyd|\.dyr|\.pscx/.test(n))return 'Dynamic model';if(/\.kmz|\.kml|parcel|boundary/.test(n))return 'Project boundary';if(/bess|battery/.test(n))return 'BESS specifications';if(/signatory|authority/.test(n))return 'Authorized signatory';if(/\.epc|\.raw/.test(n))return 'Base case';if(/\.xlsx|\.csv|\.xlsm/.test(n))return S.type==='load'?'Load data workbook':'Technical data workbook';if(/\.zip/.test(n))return 'Kickoff archive · team to sort';return 'Supporting documents'}
function addLocal(files,isOutput=false){if(!files.length)return;const addedIds=[];for(const f of files){let id=`local-${Date.now()}-${Math.random().toString(16).slice(2)}`;liveFiles.set(id,f);storeLocalFile(id,f);if(isOutput)S.outputs.push({id,name:f.name,section:'Packet',visible:true,sample:false});else{S.files.push({id,name:f.name,category:classify(f.name),sample:false});addedIds.push(id)}}if(isOutput){S.mapped=false;S.previewed=false;render()}else organizeFilesInline(addedIds)}
function seedOutputs(){S.outputs=[['Submission_Receipt.txt','Documents'],['Reviewed_Intake_Summary.txt','Intake & checks'],['Single_Line_Drawing_SAMPLE.txt','Design'],['Engineering_Assumptions.txt','Design'],['Submission_Checklist.txt','Packet'],['Delivery_Readme.txt','Packet'],['Internal_Working_Notes.txt','Packet']].map(([name,section],i)=>({id:`output-${i}`,name,section,visible:!name.startsWith('Internal_'),sample:true}));S.mapped=false;S.previewed=false;processScene('Preparing the work products.',[['Project brief carried forward','Client intake'],['Illustrative topology prepared','Design sample'],['Outputs placed in release slots','Review mapping']], 'design')}
function openRemoveFileDialog(index,trigger){
 const file=S.files[index];
 if(!file||S.role!=='client'||S.submitted)return;
 pendingRemoveFileId=file.id;
 removeFileTrigger=trigger;
 panelKind='remove-file';
 const panel=$('panel');
 panel.hidden=false;
 panel.className='market-dialog-backdrop';
 panel.innerHTML=`<div class="market-dialog confirm-file-dialog" role="dialog" aria-modal="true" aria-labelledby="remove-file-title" aria-describedby="remove-file-description"><h2 id="remove-file-title">Remove this file?</h2><p id="remove-file-description" class="muted">${e(file.name)} will be removed from the kickoff documents.</p><div class="confirm-file-actions">${btn('Cancel','close-panel')}${btn('Remove file','confirm-remove-file','primary')}</div></div>`;
 panel.querySelector('[data-action="close-panel"]').focus();
}
function confirmRemoveFile(){
 if(panelKind!=='remove-file'||!pendingRemoveFileId)return;
 const id=pendingRemoveFileId,index=S.files.findIndex(file=>file.id===id);
 closePanel();
 if(index<0)return;
 const wasSorting=organizingQueue[0]===id;
 if(wasSorting)clearTimeout(organizeTimer);
 S.files.splice(index,1);
 liveFiles.delete(id);
 removeStoredFile(id);
 organizingFileIds.delete(id);
 organizingQueue=organizingQueue.filter(fileId=>fileId!==id);
 refreshFileTable();
 persistWorkspace();
 if(wasSorting)sortNextFile();
 const buttons=[...$('app').querySelectorAll('[data-action="remove-file"]')];
 (buttons[index]||buttons.at(-1)||$('app').querySelector('[data-action="choose-files"]'))?.focus({preventScroll:true});
}
function openMarketDialog(){
 panelKind='markets';
 const panel=$('panel');
 panel.hidden=false;
 panel.className='market-dialog-backdrop';
 panel.innerHTML=`<div class="market-dialog" role="dialog" aria-modal="true" aria-labelledby="market-dialog-title"><h2 id="market-dialog-title">Choose a market</h2><p class="muted">${e(S.plan)} access · managed by GridPilot</p><div class="market-list">${markets.map(m=>btn(`<span>${e(m)}</span><small>${S.market===m?'Selected':S.allowed.includes(m)?'Available':'Not enabled'}</small>`,'select-market',`market-choice ${S.market===m?'selected':''}`,!S.allowed.includes(m),`data-market="${e(m)}" aria-pressed="${S.market===m}"`)).join('')}</div><div class="market-dialog-actions">${btn('Close','close-panel')}</div></div>`;
 $('app').querySelector('[data-action="markets"]')?.setAttribute('aria-expanded','true');
 panel.querySelector('.market-choice.selected:not(:disabled)')?.focus();
}
function openPanel(kind){closeProfileMenu();panelReturnFocus=document.activeElement;if(kind==='markets'){openMarketDialog();return}if(kind==='request-materials'||kind==='release-review'){const previousY=conversationScrollTop();panelKind=kind;startAssistantReply('inline',previousY,()=>{$('app').querySelector('.guide-inline-prompt textarea, .guide-inline-prompt button')?.focus({preventScroll:true})});return}panelKind=kind;if(kind==='projects'){projectPanelTrigger=$('profile-trigger');document.querySelectorAll('header,#rail,#app,footer').forEach(el=>el.inert=true)}$('panel').hidden=false;$('panel').className='panel-backdrop';let content='';if(kind==='projects')content=projectList();if(kind==='settings'){draftAccess={plan:S.plan,allowed:[...S.allowed]};content=settingsHTML()}if(kind==='notifications')content=`<h2>Notification recipients.</h2><p class="muted">Choose who hears about a new submission.</p><label>Team email addresses<textarea id="notify-value" placeholder="Add approved recipients, separated by commas">${e(S.notifications)}</textarea></label><label>Scope<select id="notify-scope"><option>Organization default</option><option>Example Energy override</option><option>Current project override</option></select></label><label class="checkline"><input type="checkbox" checked> New submissions</label><label class="checkline"><input type="checkbox" checked> Material resubmissions</label><label class="checkline"><input type="checkbox" checked> Notification failures</label>${btn('Save recipients','save-notifications','primary')}<p class="flow-caption">No emails are sent by this prototype.</p>`;if(kind==='request-materials')content=`<h2>What’s missing?</h2><p class="muted">A short, actionable request for the client.</p><label>Requested materials<textarea id="missing-value">${e(S.missing)}</textarea></label>${btn('Send sample request','send-request','primary')}<p class="flow-caption">Updates the prototype only. No email is sent.</p>`;if(kind==='release-review')content=releaseReview();$('panel').innerHTML=`<div class="panel-sheet" role="dialog" aria-modal="true" aria-label="${e(kind==='projects'?'My Projects':kind)}"><div class="panel-head"><span class="micro">${S.role==='admin'?'GridPilot workspace':'Your project'}</span>${btn('×','close-panel','quiet','', 'aria-label="Close panel"')}</div><div id="panel-content">${content}</div></div>`;$('panel').querySelector('button')?.focus()}
function settingsHTML(){return `<h2>Account access.</h2><p class="muted">Example Energy</p><label>Plan<select id="plan-setting"><option ${draftAccess.plan==='Demo'?'selected':''}>Demo</option><option ${draftAccess.plan==='Annual'?'selected':''}>Annual</option></select></label><p class="micro">${draftAccess.plan==='Demo'?'Choose one market':'Choose enabled markets'}</p><div class="market-grid">${markets.map(m=>btn(m,'toggle-market',draftAccess.allowed.includes(m)?'selected':'',false,`data-market="${m}"`)).join('')}</div><div class="actions">${btn('Save access','save-access','primary',!draftAccess.allowed.length)}</div><p class="flow-caption">Markets here are illustrative. Production must also check market support and contract validity. Changing access never changes an existing project’s market.</p>`}
function releaseReview(){return `<h2>Ready for the client?</h2><p class="muted">${e(S.name)} · Example Energy</p>${[['Materials confirmed',S.confirmed],['Files mapped',S.mapped],['Client preview approved',S.previewed]].map(([t,v])=>`<div class="publish-check"><span>${t}</span>${tag(v?'Ready':'Required',v?'':'amber')}</div>`).join('')}<div class="publish-check"><span>Client files</span><b>${S.outputs.filter(f=>f.visible).length}</b></div><div class="publish-check"><span>Internal files excluded</span><b>${S.outputs.filter(f=>!f.visible).length}</b></div><div class="publish-check"><span>Release</span><b>v${S.releaseCount+1} · Engineering draft</b></div><p class="flow-caption">Publishing makes this fixed version visible to the client. Engineering limitations remain visible. The client notification follows successful publication.</p><div class="actions">${btn('Publish to client','publish','primary',!(S.confirmed&&S.mapped&&S.previewed))}</div>`}
function closePanel(){
 const wasMarket=panelKind==='markets',wasRemoveFile=panelKind==='remove-file',wasProjects=panelKind==='projects',wasInline=panelKind==='request-materials'||panelKind==='release-review',trigger=removeFileTrigger,projectTrigger=projectPanelTrigger,returnFocus=panelReturnFocus;
 $('panel').hidden=true;
 $('panel').innerHTML='';
 $('panel').className='';
 panelKind='';
 pendingRemoveFileId=null;
 removeFileTrigger=null;
 projectPanelTrigger=null;
 panelReturnFocus=null;
 if(wasProjects){
  document.querySelectorAll('header,#rail,#app,footer').forEach(el=>el.inert=false);
  projectTrigger?.setAttribute('aria-expanded','false');
 }
 if(wasInline){
  if(replyKind==='inline')stopAssistantReply();
  render();
  const action=returnFocus?.dataset.action;
  if(action)$('app').querySelector(`[data-action="${action}"]`)?.focus();
 }
 if(wasMarket){const marketTrigger=$('app').querySelector('[data-action="markets"]');marketTrigger?.setAttribute('aria-expanded','false');marketTrigger?.focus()}
 else if(wasRemoveFile&&trigger?.isConnected)trigger.focus();
 else if(wasProjects&&projectTrigger?.isConnected)projectTrigger.focus();
 else if(returnFocus?.isConnected)returnFocus.focus();
}
async function downloadable(f){await filesReady;let blob=liveFiles.get(f.id);if(!blob&&!f.sample){toast('This local file is no longer available here. Please select it again.');return}if(!blob)blob=new Blob([`GRIDPILOT — DEMO WORK PRODUCT\n${f.name}\n\nThis is a prototype placeholder, not an engineering document.\nProject: ${S.name}\nSection: ${f.section}\n`],{type:'text/plain'});download(blob,f.sample?f.name.replace(/\.[^.]+$/,'.txt'):f.name)}
function download(blob,name){let a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function wireDrop(){const d=$('dropzone');if(d){d.addEventListener('dragover',ev=>{ev.preventDefault();d.classList.add('over')});d.addEventListener('dragleave',()=>d.classList.remove('over'));d.addEventListener('drop',ev=>{ev.preventDefault();d.classList.remove('over');addLocal([...ev.dataTransfer.files])})}}
function refreshBriefValues(){document.querySelectorAll('.brief-page [data-brief-value]').forEach(el=>{el.textContent=projectValues()[Number(el.dataset.briefValue)][1]})}
function validateBriefCapacity(){const input=document.querySelector('.brief-page [data-field="capacity"]');if(!input)return true;const value=input.value.trim(),invalid=input.validity.badInput||!!value&&(!Number.isFinite(Number(value))||Number(value)<=0);const error=$('capacity-error');if(invalid)input.setAttribute('aria-invalid','true');else input.removeAttribute('aria-invalid');error.hidden=!invalid;return !invalid}
document.addEventListener('input',ev=>{const el=ev.target;if(el.id==='brief-input'&&typingInput===el)stopPromptTyping();if(!el.closest('.brief-page'))return;if(el.dataset.field){if(el.dataset.field==='name')S.name=el.value;else S.fields[el.dataset.field]=el.value;S.previewed=false;if(el.dataset.field==='name'||el.dataset.field==='capacity')refreshBriefValues();if(el.dataset.field==='capacity'&&!$('capacity-error').hidden)validateBriefCapacity()}else if(el.dataset.survey)S.fields[el.dataset.survey]=el.value});
document.addEventListener('focusout',ev=>{if(ev.target.matches('.brief-page [data-field="capacity"]'))validateBriefCapacity()});
document.addEventListener('change',ev=>{let el=ev.target;if(el.id==='file-picker'){addLocal([...el.files]);el.value="";return}if(el.id==='output-picker'){addLocal([...el.files],true);return}if(el.dataset.field){if(el.dataset.field==='name')S.name=el.value;else S.fields[el.dataset.field]=el.value;S.previewed=false;if(el.closest('.brief-page'))refreshBriefValues();return}if(el.dataset.survey){S.fields[el.dataset.survey]=el.value;return}if(el.dataset.map!==undefined){S.outputs[+el.dataset.map].section=el.value;S.mapped=false;S.previewed=false;return}if(el.dataset.visibility!==undefined){S.outputs[+el.dataset.visibility].visible=el.value==='Client';S.mapped=false;S.previewed=false;return}if(el.id==='plan-setting'){draftAccess.plan=el.value;draftAccess.allowed=el.value==='Demo'?['CAISO']:[...markets];$('panel-content').innerHTML=settingsHTML()}});
document.addEventListener('input',ev=>{const el=ev.target;if(el.id==='brief-input'){S.brief=el.value;S.example=false;S.exampleIndex=null;persistWorkspace()}else if(el.id==='guide-input'){S.guideDraft=el.value;persistWorkspace()}else if(el.matches('.brief-page [data-field],.brief-page [data-survey]'))persistWorkspace()});
document.addEventListener('change',ev=>{if(ev.target.matches('[data-map],[data-visibility],.brief-page [data-field],.brief-page [data-survey]'))persistWorkspace()});
document.addEventListener('submit',ev=>{if(ev.target.id==='guide-composer-form'){ev.preventDefault();sendGuideMessage()}});
document.addEventListener('keydown',ev=>{
 if(ev.target.id==='guide-input'&&ev.key==='Enter'&&!ev.shiftKey&&!ev.isComposing){ev.preventDefault();sendGuideMessage();return}
 const menu=$('profile-menu');
 if(ev.key==='Escape'){
  if(menu&&!menu.hidden){ev.preventDefault();closeProfileMenu(true);return}
  closePanel();
  return;
 }
 if(menu&&!menu.hidden&&(ev.key==='ArrowDown'||ev.key==='ArrowUp')){
  const items=[...menu.querySelectorAll('[role="menuitem"]:not([hidden])')];
  const current=items.indexOf(document.activeElement);
  const step=ev.key==='ArrowDown'?1:-1;
  ev.preventDefault();
  items[current<0?(step===1?0:items.length-1):(current+step+items.length)%items.length].focus();
  return;
 }
 if(ev.key==='Tab'&&['markets','remove-file','projects'].includes(panelKind)){
  const buttons=[...$('panel').querySelectorAll('button:not(:disabled)')];
  if(!buttons.length)return;
  const first=buttons[0],last=buttons[buttons.length-1];
  if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last.focus()}
  else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first.focus()}
 }
});
document.addEventListener('focusin',ev=>{
 const menu=$('profile-menu');
 if(menu&&!menu.hidden&&!$('profile-wrap').contains(ev.target))closeProfileMenu();
});
document.addEventListener('click',ev=>{
 const trigger=ev.target.closest('.guide-disclosure-trigger');
 if(!trigger)return;
 const panel=$(trigger.getAttribute('aria-controls'));
 const open=trigger.getAttribute('aria-expanded')!=='true';
 if(!open&&panel.contains(document.activeElement))trigger.focus({preventScroll:true});
 trigger.setAttribute('aria-expanded',String(open));
 panel.setAttribute('aria-hidden',String(!open));
 panel.inert=!open;
 trigger.parentElement.classList.toggle('is-open',open);
 if(open)expandedGuideDisclosures.add(panel.id);
 else expandedGuideDisclosures.delete(panel.id);
});
document.addEventListener('click',ev=>{if(!$('profile-wrap').contains(ev.target))closeProfileMenu();if(ev.target===$('panel')&&['markets','remove-file','projects'].includes(panelKind)){closePanel();return}const b=ev.target.closest('[data-action]');if(!b||b.disabled)return;dispatch(b.dataset.action,{...b.dataset,fromButtonClick:['send','build-brief'].includes(b.dataset.action),pointerClick:ev.detail>0,trigger:b})});
document.addEventListener('click',()=>queueMicrotask(persistWorkspace));
async function dispatch(a,d={}){switch(a){case 'client':closeProfileMenu();S.token++;closePanel();S.role='client';S.preview=false;move(S.release?'packet':S.clientScreen);break;case 'admin':closeProfileMenu();S.token++;S.role='admin';S.preview=false;if(!S.submitted)move('admin-empty');else move(S.adminScreen);break;case 'restart':closeProfileMenu();stopAssistantReply();expandedGuideDisclosures.clear();$('app').style.minHeight='';S=initial();projectSnapshots.clear();currentProjectId=1;nextProjectId=2;clearTimeout(organizeTimer);organizingFileIds.clear();organizingQueue=[];liveFiles.clear();clearStoredFiles();try{localStorage.removeItem(workspaceKey)}catch{}closePanel();window.scrollTo({top:0,behavior:'instant'});render();$('client-tab').focus();break;case 'profile-menu':toggleProfileMenu();break;case 'projects':case 'markets':case 'settings':case 'notifications':case 'request-materials':case 'release-review':openPanel(a);break;case 'close-panel':closePanel();break;case 'start':S.role='client';closePanel();move('intro');break;case 'new-project':startNewProject();break;case 'open-project':openSavedProject(Number(d.projectId));break;case 'type':if(S.submitted)return;S.type=d.type;S.brief='';S.example=false;S.exampleIndex=null;S.fields={};S.answers={};render();break;case 'select-market':{if(S.submitted||!S.allowed.includes(d.market))return;if(S.market===d.market){closePanel();break}const entered=$('brief-input')?.value;if(entered!==undefined&&entered!==S.brief){S.brief=entered;S.example=false;S.exampleIndex=null}S.market=d.market;closePanel();render();$('app').querySelector('[data-action="markets"]')?.focus();break}case 'example':loadExample(Number(d.example)||0,d.pointerClick);break;case 'send':{if(!d.fromButtonClick)return;stopPromptTyping(true);let t=$('brief-input')?.value.trim();if(!t){toast('Describe your project, or choose an example.');return}const unchangedExample=S.example&&t===S.brief;S.brief=t;S.example=unchangedExample;if(!unchangedExample)S.exampleIndex=null;S.name=S.name||`New ${S.type} project`;const n=t.match(/(\d+(?:\.\d+)?)\s*MW\b/i);if(n)S.fields.capacity=n[1];move('chat');break}case 'back-intro':move('intro');break;case 'chat':move('chat');break;case 'answer':{const previousY=conversationScrollTop();S.answers[d.key]=d.value;startAssistantReply('chat',previousY);break;}case 'build-brief':if(!d.fromButtonClick||S.screen!=='chat'||!['track','schedule','poi'].every(k=>S.answers[k]))return;await processScene('Putting the brief together.',[['Your project captured',S.market],['Preferences carried forward','Client supplied'],['Unknowns left for the team','No extra typing']], 'brief');break;case 'brief':move('brief');break;case 'setup':if(S.screen!=='brief')return;if(!validateBriefCapacity()){const details=document.querySelector('[data-refine-project]');details.open=true;details.querySelector('[data-field=capacity]').focus();return}if(!S.name.trim())S.name=`New ${S.type} project`;await processScene('Setting up the filing.',[['Your project captured',S.market],['Brief and answers carried forward','Client supplied'],['Kickoff documents ready','Next step']], 'documents');break;case 'choose-files':$('file-picker')?.click();break;case 'sample-files':sampleFiles();break;case 'remove-file':openRemoveFileDialog(Number(d.i),d.trigger);break;case 'confirm-remove-file':confirmRemoveFile();break;case 'submit':case 'resubmit':if(!S.files.length||organizingFileIds.size)return;S.submitted=true;S.status='Submitted';S.clientScreen='waiting';S.adminScreen='documents';S.events.push({type:a,time:new Date().toISOString()});move('waiting');toast('Submission recorded in the prototype. Administrator inbox updated.');break;case 'stage':move(d.stage);break;case 'documents':case 'waiting':case 'design':case 'packet':move(a);break;case 'confirm':if(!S.files.length||!S.submitted)return;S.confirmed=true;S.status='In progress';S.extracted=true;await processScene('Reading the project.',[['Project brief identified',S.name],['Client answers carried forward','Intake'],[S.example?'Sample sources linked':'Source files queued for team review',`${S.files.length} materials`],['Unknowns kept visible','Review required']], 'intake');break;case 'intake':move('intake');break;case 'choose-outputs':$('output-picker')?.click();break;case 'sample-outputs':seedOutputs();break;case 'confirm-map':if(!S.outputs.some(f=>f.visible)){toast('Select at least one client-visible output.');return}S.mapped=true;S.previewed=false;render();toast('Mapped in Documents → Intake & checks → Design → Packet order.');break;case 'build-packet':if(!S.mapped)return;await processScene('Assembling the packet.',[['Visible files collected',`${S.outputs.filter(x=>x.visible).length} outputs`],['Internal working files excluded','Private'],['Four steps, one reviewable release','Draft']], 'packet');break;case 'preview':S.preview=true;render();break;case 'exit-preview':S.preview=false;render();break;case 'approve-preview':S.previewed=true;S.preview=false;render();openPanel('release-review');break;case 'publish':if(!(S.confirmed&&S.mapped&&S.previewed))return;S.releaseCount++;S.release={version:S.releaseCount,outputs:structuredClone(S.outputs.filter(f=>f.visible)),project:structuredClone({name:S.name,market:S.market,type:S.type,fields:S.fields,answers:S.answers}),publishedAt:new Date().toISOString()};S.status='Ready to download';S.events.push({type:'published',version:S.releaseCount});S.previewed=false;closePanel();await processScene('Making the release available.',[['Release snapshot created',`v${S.releaseCount}`],['Client workspace updated','Published'],['Notification event recorded','Prototype only']], 'packet');toast('Published to the sample client. Switch to Client experience.');break;case 'toggle-market':draftAccess.allowed=draftAccess.plan==='Demo'?[d.market]:draftAccess.allowed.includes(d.market)?draftAccess.allowed.filter(x=>x!==d.market):[...draftAccess.allowed,d.market];$('panel-content').innerHTML=settingsHTML();break;case 'save-access':S.plan=draftAccess.plan;S.allowed=[...draftAccess.allowed];if(!S.submitted&&!S.allowed.includes(S.market))S.market=S.allowed[0];closePanel();render();toast('Account access saved. Existing project market is preserved.');break;case 'save-notifications':{let v=$('notify-value').value,addresses=v.split(/[\s,;]+/).filter(Boolean);if(addresses.some(x=>!/^\S+@\S+\.\S+$/.test(x))){toast('Check the email addresses.');return}S.notifications=[...new Set(addresses)].join(', ');closePanel();toast('Recipients saved for this prototype session. No emails sent.');break}case 'send-request':S.missing=$('missing-value').value.trim()||'Please add your available supporting materials.';S.status='Action needed';S.confirmed=false;S.extracted=false;closePanel();move('documents');toast('Sample client now has a material request.');break;case 'download-output':{const source=S.role==='client'?S.release?.outputs:S.outputs;const f=source?.find(x=>x.id===d.fileid);if(f)downloadable(f);break}case 'download-packet':if(S.release)await downloadPacket();break;case 'download-manifest':if(S.release)download(new Blob([JSON.stringify({notice:'Design prototype only. Sample files are not engineering deliverables.',...S.release},null,2)],{type:'application/json'}),`GridPilot_Release_v${S.release.version}_SAMPLE.json`);break}}
restoreWorkspace();
if(performance.getEntriesByType('navigation')[0]?.type==='navigate'){
 if(S.name||S.brief.trim()||S.files.length||S.submitted){
  projectSnapshots.set(currentProjectId,structuredClone(S));
  currentProjectId=nextProjectId++;
 }
 S=initial();
 restoredScrollY=0;
}
filesReady=restoreStoredFiles();
if('scrollRestoration' in history)history.scrollRestoration='manual';
const restorePosition=()=>requestAnimationFrame(()=>{
 if(S.screen==='intro')window.scrollTo({top:restoredScrollY,behavior:'instant'});
 else{$('app').scrollTop=restoredScrollY;window.scrollTo({top:0,behavior:'instant'})}
});
if(document.readyState==='complete')restorePosition();else window.addEventListener('load',restorePosition,{once:true});
let scrollSaveTimer=0;
const saveScroll=()=>{clearTimeout(scrollSaveTimer);scrollSaveTimer=setTimeout(persistWorkspace,150)};
window.addEventListener('scroll',saveScroll,{passive:true});
$('app').addEventListener('scroll',saveScroll,{passive:true});
window.addEventListener('pagehide',persistWorkspace);
render();

async function downloadPacket(){
 const rel=S.release;if(!rel)return;
 await filesReady;
 if(rel.outputs.some(file=>!file.sample&&!liveFiles.has(file.id))){toast('One or more local output files are unavailable. Please select them again.');return}
 const te=new TextEncoder(),items=[{name:'00_Release_Manifest.json',bytes:te.encode(JSON.stringify({notice:'INTERACTIVE PROTOTYPE. Sample outputs are placeholders, not engineering deliverables.',...rel},null,2))}];
 for(const f of rel.outputs){const raw=liveFiles.get(f.id);const bytes=raw?new Uint8Array(await raw.arrayBuffer()):te.encode(`GRIDPILOT SAMPLE OUTPUT\n${f.name}\nProject: ${rel.project.name}\nSection: ${f.section}\nThis is a prototype placeholder, not an engineering document.\n`);const section=String(sections.indexOf(f.section)+1).padStart(2,'0')+'_'+f.section.replace(/[^a-z0-9]+/gi,'_');items.push({name:section+'/'+f.name.replace(/[\\/]/g,'_'),bytes})}
 function crc(a){let c=0xffffffff;for(const b of a){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0}
 const chunks=[],central=[];let offset=0,centralLen=0;
 for(const item of items){const name=te.encode(item.name),data=item.bytes,checksum=crc(data),h=new Uint8Array(30+name.length),v=new DataView(h.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,checksum,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);h.set(name,30);chunks.push(h,data);const c=new Uint8Array(46+name.length),w=new DataView(c.buffer);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x800,true);w.setUint32(16,checksum,true);w.setUint32(20,data.length,true);w.setUint32(24,data.length,true);w.setUint16(28,name.length,true);w.setUint32(42,offset,true);c.set(name,46);central.push(c);centralLen+=c.length;offset+=h.length+data.length}
 const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,items.length,true);v.setUint16(10,items.length,true);v.setUint32(12,centralLen,true);v.setUint32(16,offset,true);
 download(new Blob([...chunks,...central,end],{type:'application/zip'}),`GridPilot_SAMPLE_Packet_v${rel.version}.zip`);toast('Sample packet downloaded. Not an engineering submission.');
}
