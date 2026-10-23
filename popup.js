const $ = id => document.getElementById(id);
const COMMON = ["email","country","state","city","pincode","address"];
let pilgrims = [];
let editingIndex = null;

function status(msg,bad=false){$("status").textContent=msg;$("status").style.color=bad?"#b3261e":"#137333";}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function pageRect(tabId,kind,value,index=0){
  const results=await chrome.scripting.executeScript({target:{tabId,allFrames:true},world:"MAIN",func:(targetKind,targetValue,targetIndex)=>{
    const norm=s=>(s||"").toLowerCase().replace(/[*:()[\]_-]/g," ").replace(/\s+/g," ").trim();
    let el=null;
    if(targetKind==="field")el=[...document.querySelectorAll(`[name="${CSS.escape(targetValue)}"]`)].filter(n=>n.getClientRects().length)[targetIndex]||null;
    else el=[...document.querySelectorAll("li")].find(n=>n.getClientRects().length&&norm(n.textContent)===norm(targetValue));
    if(!el)return null;const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,width:r.width,height:r.height};
  },args:[kind,value,index]});
  return results.map(r=>r.result).find(r=>r&&r.width>0&&r.height>0)||null;
}
async function trustedMouseClick(tabId,rect){
  const target={tabId},x=Math.round(rect.x),y=Math.round(rect.y);
  await chrome.debugger.sendCommand(target,"Input.dispatchMouseEvent",{type:"mouseMoved",x,y});
  await chrome.debugger.sendCommand(target,"Input.dispatchMouseEvent",{type:"mousePressed",x,y,button:"left",clickCount:1});
  await chrome.debugger.sendCommand(target,"Input.dispatchMouseEvent",{type:"mouseReleased",x,y,button:"left",clickCount:1});
}
async function trustedSelects(tabId,people){
  if(!people?.some(person=>person?.gender||person?.idType))return;
  const target={tabId};await chrome.debugger.attach(target,"1.3");
  try{
    for(let index=0;index<people.length;index++){
      const person=people[index],selections=[["gender",person?.gender],["photoIdType",person?.idType]];
      for(const [fieldName,value] of selections){
        if(!value)continue;
        const fieldRect=await pageRect(tabId,"field",fieldName,index);
        if(!fieldRect)continue;
        await trustedMouseClick(tabId,fieldRect);await delay(250);
        const optionRect=await pageRect(tabId,"option",value);
        if(!optionRect)throw new Error(`Pilgrim ${index+1}: ${fieldName} option '${value}' was not found.`);
        await trustedMouseClick(tabId,optionRect);await delay(300);
      }
    }
  }finally{await chrome.debugger.detach(target).catch(()=>{});}
}
function commonFromForm(){const shared={};for(const k of COMMON)shared[k]=$(k).value.trim();return shared;}
function readPersonForm(){return {name:$("pName").value.trim(),age:$("pAge").value.trim(),gender:$("pGender").value,idType:$("pIdType").value,idNumber:$("pIdNumber").value.trim()};}
function clearPersonForm(){["pName","pAge","pGender","pIdType","pIdNumber"].forEach(k=>$(k).value="");}
function openEditor(index=null){
  editingIndex=index; clearPersonForm();
  $("editorTitle").textContent=index===null?"Add new pilgrim":"Edit pilgrim details";
  $("saveUser").textContent=index===null?"Save User":"Update User";
  if(index!==null){const p=pilgrims[index];$("pName").value=p.name||"";$("pAge").value=p.age||"";$("pGender").value=["Female","Male","Transgender"].includes(p.gender)?p.gender:"";$("pIdType").value=["Aadhaar Card","Passport"].includes(p.idType)?p.idType:"";$("pIdNumber").value=p.idNumber||"";}
  $("editor").classList.remove("hidden");$("pName").focus();
}
function closeEditor(){$("editor").classList.add("hidden");editingIndex=null;clearPersonForm();}
function renderPilgrims(){
  const root=$("pilgrimList");root.innerHTML="";
  if(!pilgrims.length){const empty=document.createElement("div");empty.className="small";empty.textContent="No users added yet. Click “Add User” to enter the first pilgrim.";root.appendChild(empty);return;}
  pilgrims.forEach((p,i)=>{
    const card=document.createElement("div");card.className="card";
    const head=document.createElement("div");head.className="cardhead";
    const name=document.createElement("span");name.textContent=`${i+1}. ${p.name||"Unnamed pilgrim"}`;head.appendChild(name);
    const actions=document.createElement("div");actions.className="actions";
    const edit=document.createElement("button");edit.type="button";edit.className="secondary";edit.textContent="Edit";edit.addEventListener("click",()=>openEditor(i));
    const del=document.createElement("button");del.type="button";del.className="danger";del.textContent="Delete";del.addEventListener("click",()=>{
      if(confirm(`Delete ${p.name||"this pilgrim"}?`)){pilgrims.splice(i,1);renderPilgrims();saveAll().catch(e=>status(e.message,true));}
    });
    actions.append(edit,del);head.appendChild(actions);card.appendChild(head);
    const details=document.createElement("div");details.className="small";details.style.marginTop="6px";
    details.textContent=`Age: ${p.age||"—"} · Gender: ${p.gender||"—"} · ID: ${p.idType||"—"} · ${p.idNumber?"ID number saved":"No ID number"}`;
    card.appendChild(details);root.appendChild(card);
  });
}
async function saveAll(show=true){
  const data={shared:commonFromForm(),pilgrims};
  await chrome.storage.local.set({ttdAutofillData:data});
  if(show)status("General Details and all pilgrim profiles saved locally.");
  return data;
}
function renderData(data){
  const shared=data?.shared||{};
  for(const k of COMMON)$(k).value=shared[k]|| (k==="country"?"India":"");
  pilgrims=Array.isArray(data?.pilgrims)?data.pilgrims:[];
  renderPilgrims();
}
$("addUser").addEventListener("click",()=>openEditor());
$("cancelEdit").addEventListener("click",closeEditor);
$("saveUser").addEventListener("click",async()=>{
  const person=readPersonForm();
  if(!person.name){status("Enter the pilgrim's name first.",true);$("pName").focus();return;}
  if(editingIndex===null)pilgrims.push(person);else pilgrims[editingIndex]=person;
  renderPilgrims();closeEditor();
  try{await saveAll();}catch(e){status("Could not save user: "+e.message,true);}
});
$("saveAll").addEventListener("click",async()=>{try{await saveAll();}catch(e){status(e.message,true);}});
$("fill").addEventListener("click",async()=>{
  try{
    const data=await saveAll(false);const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.id||!/^https:\/\/([a-z0-9-]+\.)*ttdevasthanams\.ap\.gov\.in\//i.test(tab.url||"")){status("Open an official TTD page first.",true);return;}
    await trustedSelects(tab.id,data.pilgrims);
    await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},files:["content.js"]}).catch(()=>{});
    const frames=await chrome.webNavigation.getAllFrames({tabId:tab.id});
    const replies=(await Promise.all(frames.map(frame=>chrome.tabs.sendMessage(tab.id,{type:"TTD_AUTOFILL",data},{frameId:frame.frameId}).catch(()=>null)))).filter(Boolean);
    const r=replies.sort((a,b)=>(b.count||0)-(a.count||0)||(b.detected||0)-(a.detected||0))[0];
    status(r?.message||"No accessible TTD form frame was found.",!r||!(r.count>0));
  }catch(e){status(e.message||"Could not fill page.",true);}
});
async function messageAllFrames(type){
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.id||!/^https:\/\/([a-z0-9-]+\.)*ttdevasthanams\.ap\.gov\.in\//i.test(tab.url||""))throw new Error("Open an official TTD page first.");
  await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},files:["content.js"]}).catch(()=>{});
  const frames=await chrome.webNavigation.getAllFrames({tabId:tab.id});
  const replies=await Promise.all(frames.map(frame=>chrome.tabs.sendMessage(tab.id,{type},{frameId:frame.frameId}).catch(()=>null)));
  return replies.filter(Boolean);
}
$("learnStart").addEventListener("click",async()=>{
  try{const replies=await messageAllFrames("TTD_LEARN_START");if(!replies.length)throw new Error("Could not start Learn Mode.");status("Learn Mode started. Close this popup and manually fill the three fields.");}
  catch(e){status(e.message,true);}
});
$("learnReport").addEventListener("click",async()=>{
  try{
    const replies=await messageAllFrames("TTD_LEARN_GET"),reports=replies.map(r=>r.report).filter(r=>r?.events?.length);
    if(!reports.length)throw new Error("No manual actions recorded. Start Learn Mode first, then fill the fields manually.");
    const blob=new Blob([JSON.stringify({generatedAt:new Date().toISOString(),reports},null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="ttd-learn-report.json";a.click();URL.revokeObjectURL(url);
    status(`Learn report downloaded (${reports.reduce((n,r)=>n+r.events.length,0)} events).`);
  }catch(e){status(e.message,true);}
});
$("export").addEventListener("click",async()=>{
  try{const d=await saveAll(false);const u=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=u;a.download="ttd-autofill-backup.json";a.click();URL.revokeObjectURL(u);status("Backup exported. Keep it private.");}
  catch(e){status(e.message,true);}
});
$("import").addEventListener("click",()=>$("file").click());
$("file").addEventListener("change",async()=>{
  const f=$("file").files?.[0];if(!f)return;
  try{const d=JSON.parse(await f.text());if(!d||typeof d!=="object"||!Array.isArray(d.pilgrims))throw new Error("Backup must contain shared details and a pilgrims list.");renderData(d);await saveAll();status("Backup imported successfully.");}
  catch(e){status("Import failed: "+e.message,true);}finally{$("file").value="";}
});
$("clear").addEventListener("click",async()=>{
  if(!confirm("Clear all saved General Details and pilgrim profiles?"))return;
  await chrome.storage.local.remove("ttdAutofillData");renderData({});closeEditor();status("All saved details cleared.");
});
chrome.storage.local.get("ttdAutofillData").then(({ttdAutofillData})=>renderData(ttdAutofillData||{})).catch(e=>status(e.message,true));
