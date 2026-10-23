(() => {
  if(window.__ttdAutofillAssistantLoaded)return;
  window.__ttdAutofillAssistantLoaded=true;
  const EXT_VERSION="1.0.20";
  let learnEvents=[],learning=false,learnStartedAt="";
  const norm=s=>(s||"").toLowerCase().replace(/[*:()[\]_-]/g," ").replace(/\s+/g," ").trim();
  function fieldText(el){
    const a=[el.getAttribute("aria-label"),el.getAttribute("placeholder"),el.getAttribute("name"),el.id,el.getAttribute("autocomplete")];
    const labelledBy=el.getAttribute("aria-labelledby");
    if(labelledBy)labelledBy.split(/\s+/).forEach(id=>{const n=document.getElementById(id);if(n)a.push(n.innerText||n.textContent);});
    if(el.id){const l=document.querySelector(`label[for="${CSS.escape(el.id)}"]`);if(l)a.push(l.innerText);}
    const wl=el.closest("label");if(wl)a.push(wl.innerText);
    let p=el.parentElement;
    for(let depth=0;p&&depth<5;depth++,p=p.parentElement){
      const l=p.querySelector("label,mat-label,.mat-form-field-label,.mat-mdc-form-field-label,[class*='label'],[class*='Label']");
      if(l&&l!==el){a.push(l.innerText||l.textContent);break;}
    }
    return norm(a.filter(Boolean).join(" "));
  }
  const controlSelector="input,select,textarea,mat-select,[role='combobox'],[role='button'][aria-haspopup='listbox'],[aria-haspopup='listbox'],.MuiSelect-select";
  function usable(e){return !e.disabled&&e.getAttribute("aria-disabled")!=="true"&&!["hidden","submit","button","reset","password","file","checkbox","radio"].includes((e.type||"").toLowerCase());}
  function fields(){return [...document.querySelectorAll(controlSelector)].filter((e,i,a)=>a.indexOf(e)===i&&usable(e));}
  function controlsByVisibleLabel(label){
    const wanted=norm(label),labels=[...document.querySelectorAll("label,span,p,div")]
      .filter(e=>norm(e.textContent)===wanted&&e.getClientRects().length);
    const result=[];
    for(const labelEl of labels){
      let control=null;
      if(labelEl.htmlFor)control=document.getElementById(labelEl.htmlFor);
      for(let p=labelEl.parentElement,depth=0;!control&&p&&depth<6;depth++,p=p.parentElement){
        const candidates=[...p.querySelectorAll(controlSelector)].filter(usable);
        if(candidates.length===1)control=candidates[0];
      }
      if(!control){
        const lr=labelEl.getBoundingClientRect();
        control=fields().map(el=>({el,r:el.getBoundingClientRect()}))
          .filter(x=>x.r.width&&x.r.height&&x.r.top>=lr.top-8&&x.r.top<=lr.bottom+80)
          .sort((a,b)=>(Math.abs(a.r.left-lr.left)+Math.abs(a.r.top-lr.bottom))-(Math.abs(b.r.left-lr.left)+Math.abs(b.r.top-lr.bottom)))[0]?.el||null;
      }
      if(control&&!result.includes(control))result.push(control);
    }
    return result;
  }
  function controlDiagnostics(list){
    return list.map((el,i)=>{
      const attrs=["name","id","type","role","aria-label","aria-labelledby","aria-haspopup","data-value"]
        .map(k=>{const v=el.getAttribute(k);return v?`${k}=${v}`:"";}).filter(Boolean).join(" ");
      const fieldName=el.getAttribute("name")||"",sensitive=/aadh|idproofnumber|idnumber|passportnumber/i.test(fieldName);
      return `${i+1}:${el.tagName}${attrs?`[${attrs}]`:""}{text=${norm(el.textContent).slice(0,35)};label=${fieldText(el).slice(0,70)};value=${sensitive?"[redacted]":String(el.value??"").slice(0,35)}}`;
    }).join(" | ");
  }
  function nodeDescription(node){
    if(!(node instanceof Element))return String(node?.nodeName||"");
    const attrs=["name","id","type","role","aria-label","aria-haspopup","data-value"]
      .map(k=>{const v=node.getAttribute(k);return v?`${k}=${v}`:"";}).filter(Boolean);
    const classes=[...node.classList].slice(0,4).join(".");
    return `${node.tagName}${classes?`.${classes}`:""}${attrs.length?`[${attrs.join(" ")}]`:""}`;
  }
  function learnListener(event){
    if(!learning||!event.isTrusted)return;
    const target=event.target,fieldName=target instanceof Element?(target.getAttribute("name")||""):"";
    const safeValue=["gender","photoIdType"].includes(fieldName)?String(target.value||""):fieldName?"[redacted]":"";
    learnEvents.push({time:Date.now(),event:event.type,target:nodeDescription(target),fieldName,value:safeValue,text:fieldName?"":norm(target?.textContent).slice(0,60),path:event.composedPath().slice(0,7).map(nodeDescription)});
    if(learnEvents.length>300)learnEvents.shift();
  }
  ["pointerdown","mousedown","mouseup","click","input","change","focus","blur"].forEach(type=>document.addEventListener(type,learnListener,true));
  const sectionNames=["general details","pilgrim details"];
  function sectionHeading(name){
    const candidates=[...document.querySelectorAll("h1,h2,h3,h4,h5,h6,legend,div,section,p,span")]
      .filter(e=>norm(e.textContent)===name);
    // Prefer the innermost matching element. UI libraries often repeat the same
    // heading text on its parent wrappers.
    return candidates.find(e=>![...e.children].some(c=>norm(c.textContent)===name))||candidates[0]||null;
  }
  function fieldsInSection(name,allFields){
    const heading=sectionHeading(name);
    if(!heading)return null;
    const nextHeadings=sectionNames.filter(n=>n!==name).map(sectionHeading).filter(Boolean);
    const next=nextHeadings
      .filter(h=>heading.compareDocumentPosition(h)&Node.DOCUMENT_POSITION_FOLLOWING)
      .sort((a,b)=>(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING)?-1:1)[0];
    return allFields.filter(el=>
      (heading.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING) &&
      (!next || (el.compareDocumentPosition(next)&Node.DOCUMENT_POSITION_FOLLOWING))
    );
  }
  function category(el){
    const t=fieldText(el);
    if(/captcha|otp|one time password|verification code|payment|card number|cvv|upi/.test(t))return null;
    if(/photo id proof|photoidproof|id proof|idproof|identity type|proof type|document type|id type|idtype/.test(t))return "idType";
    if(/photo id number|photoidnumber|id number|idnumber|identity number|document number|\baadh?aar\b/.test(t))return "idNumber";
    if(/e.?mail/.test(t))return "email";
    if(/pincode|postal code|zip code|pin code/.test(t))return "pincode";
    if(/\bcountry\b/.test(t))return "country";
    if(/\bstate\b/.test(t))return "state";
    if(/\bcity\b|town/.test(t))return "city";
    if(/address|street|locality|district/.test(t))return "address";
    if(/\bage\b|age of/.test(t))return "age";
    if(/gender|sex\b/.test(t))return "gender";
    if(/devotee|pilgrim|passenger|applicant|full name|name of|first name|last name|\bfname\b|\bname\b/.test(t))return "name";
    return null;
  }
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function selectInMainWorld(fieldName,value){
    return new Promise(resolve=>{
      const token=`${Date.now()}-${Math.random()}`;
      const done=event=>{if(event.source===window&&event.data?.source==="TTD_AUTOFILL_PAGE"&&event.data?.type==="SELECT_RESULT"&&event.data?.token===token){window.removeEventListener("message",done);resolve(!!event.data.ok);}};
      window.addEventListener("message",done);
      window.postMessage({source:"TTD_AUTOFILL_EXTENSION",type:"SELECT",token,fieldName,value},"*");
      setTimeout(()=>{window.removeEventListener("message",done);resolve(false);},2500);
    });
  }
  async function setValue(el,value){
    if(value==null||String(value).trim()==="")return false;
    const wanted=String(value).trim();
    if(norm(el.value)===norm(wanted))return true;
    const fieldName=el.getAttribute("name")||"";
    if(el.tagName==="SELECT"){
      const n=norm(wanted),opts=[...el.options];
      const found=opts.find(o=>norm(o.value)===n||norm(o.textContent)===n)||opts.find(o=>norm(o.value).includes(n)||norm(o.textContent).includes(n));
      if(!found)return false;el.value=found.value;
    }else if(["gender","photoIdType"].includes(fieldName)||!["INPUT","TEXTAREA","SELECT"].includes(el.tagName)||el.tagName==="MAT-SELECT"||el.getAttribute("role")==="combobox"||el.getAttribute("aria-haspopup")==="listbox"||el.classList.contains("MuiSelect-select")){
      if(["gender","photoIdType"].includes(fieldName)&&await selectInMainWorld(fieldName,wanted)){
        await wait(250);
        const live=[...document.querySelectorAll(`[name="${CSS.escape(fieldName)}"]`)].find(n=>n.getClientRects().length)||el;
        const selectedText=norm(`${live.value||""} ${live.parentElement?.textContent||""}`);
        const aliases=norm(wanted)==="aadhaar card"?["aadhaar card","aadhaar","aadhar"]:[norm(wanted)];
        if(aliases.some(a=>selectedText.includes(a)))return true;
      }
      const n=norm(wanted);
      const aliases=n==="aadhaar card"?["aadhaar card","aadhaar","aadhar"]:[n];
      const findOption=()=>{
        const preferred=[...document.querySelectorAll("mat-option,[role='option'],li[data-value],.mat-option,.mat-mdc-option,.MuiMenuItem-root")]
          .filter(o=>o.getClientRects().length);
        return preferred.find(o=>aliases.includes(norm(o.textContent))||aliases.includes(norm(o.getAttribute("data-value"))))||
          [...document.querySelectorAll("body *")].find(o=>o.getClientRects().length&&aliases.includes(norm(o.textContent))&&![...o.children].some(c=>aliases.includes(norm(c.textContent))));
      };
      let found=findOption();
      const openTargets=[];
      const visibleLabel=fieldName==="gender"?"gender":fieldName==="photoIdType"?"photo id proof":"";
      if(visibleLabel){
        const labelEls=[...document.querySelectorAll("label,span,p,div")].filter(n=>norm(n.textContent)===visibleLabel&&n.getClientRects().length);
        for(const labelEl of labelEls){
          const r=labelEl.getBoundingClientRect(),y=Math.min(window.innerHeight-1,r.bottom+12);
          for(const x of [r.left+4,r.left+r.width/2,r.right-4]){
            const hit=document.elementFromPoint(Math.max(0,Math.min(window.innerWidth-1,x)),y);
            if(hit)openTargets.push(hit,hit.parentElement,hit.nextElementSibling,hit.previousElementSibling);
          }
        }
      }
      const triggerSelector="button,[role='button'],svg,img,[class*='select'],[class*='Select'],[class*='dropdown'],[class*='Dropdown'],[class*='arrow'],[class*='Arrow']";
      for(let node=el,depth=0;node&&depth<6;depth++,node=node.parentElement){
        openTargets.push(node,...node.querySelectorAll(triggerSelector));
        if(node.previousElementSibling)openTargets.push(node.previousElementSibling);
        if(node.nextElementSibling)openTargets.push(node.nextElementSibling);
      }
      el.focus();
      for(const key of ["ArrowDown","Enter"," "]){
        el.dispatchEvent(new KeyboardEvent("keydown",{key,code:key===" "?"Space":key,bubbles:true,cancelable:true}));
        el.dispatchEvent(new KeyboardEvent("keyup",{key,code:key===" "?"Space":key,bubbles:true,cancelable:true}));
        await wait(100);
        found=findOption();
        if(found)break;
      }
      for(const target of [...new Set(openTargets.filter(Boolean))]){
        if(found)break;
        if(!target.getClientRects().length)continue;
        target.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,cancelable:true,view:window,button:0}));
        target.dispatchEvent(new MouseEvent("mouseup",{bubbles:true,cancelable:true,view:window,button:0}));
        target.click();
        await wait(180);
        found=findOption();
      }
      if(!found){document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));return false;}
      found.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,cancelable:true,view:window,button:0}));
      found.dispatchEvent(new MouseEvent("mouseup",{bubbles:true,cancelable:true,view:window,button:0}));
      found.click();
      await wait(250);
      const live=fieldName?[...document.querySelectorAll(`[name="${CSS.escape(fieldName)}"]`)].find(n=>n.getClientRects().length):el;
      const selectedText=norm(`${live?.value||""} ${live?.parentElement?.textContent||""}`);
      return aliases.some(a=>selectedText.includes(a));
    }else{
      el.focus();
      if(typeof el.select==="function")el.select();
      // execCommand produces the same browser editing path as user typing and is
      // required by TTD's controlled React inputs. Keep the native setter fallback.
      if(document.execCommand("insertText",false,wanted)){
        el.dispatchEvent(new Event("change",{bubbles:true}));
        el.blur();
        await wait(75);
        const live=[...document.querySelectorAll(`[name="${CSS.escape(fieldName)}"]`)].find(n=>n===el||n.getClientRects().length)||el;
        if(String(live.value??"").trim()===wanted)return true;
      }
      const proto=el.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      const setter=Object.getOwnPropertyDescriptor(proto,"value")?.set;if(setter)setter.call(el,wanted);else el.value=wanted;
    }
    el.focus();
    el.dispatchEvent(new InputEvent("input",{bubbles:true,inputType:"insertText",data:wanted}));
    el.dispatchEvent(new Event("change",{bubbles:true}));
    el.blur();
    await wait(25);
    // React may replace the controlled input node immediately after onChange.
    // Reaching this point means the native setter and framework events ran.
    const name=el.getAttribute("name"),replacement=name?[...document.querySelectorAll(`[name="${CSS.escape(name)}"]`)].find(n=>n===el||n.getClientRects().length):el;
    return String(replacement?.value??"").trim()===wanted;
  }
  chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
    if(msg?.type==="TTD_LEARN_START"){
      learnEvents=[];learning=true;learnStartedAt=new Date().toISOString();
      sendResponse({ok:true,message:"Learn Mode started. Manually fill Gender, Photo ID Proof and Photo ID Number, then download the report."});
      return;
    }
    if(msg?.type==="TTD_LEARN_GET"){
      learning=false;
      sendResponse({ok:true,report:{version:EXT_VERSION,url:location.href,startedAt:learnStartedAt,endedAt:new Date().toISOString(),controls:controlDiagnostics(fields()),events:learnEvents}});
      return;
    }
    if(msg?.type!=="TTD_AUTOFILL")return;
    (async()=>{try{
      const data=msg.data||{},shared=data.shared||{},pilgrims=Array.isArray(data.pilgrims)?data.pilgrims:[],els=fields();let count=0;
      const generalFields=fieldsInSection("general details",els);
      const detectedPilgrimFields=fieldsInSection("pilgrim details",els);
      const pilgrimFields=detectedPilgrimFields?.length?detectedPilgrimFields:els;
      let generalCount=0, pilgrimCount=0;
      // General values are filled only when that section exists. This prevents a
      // pilgrim-only page from receiving common values in similarly named fields.
      if(generalFields?.length){
        for(const key of ["email","country","state","city","pincode","address"]){
          const el=generalFields.find(e=>category(e)===key);
          if(el&&await setValue(el,shared[key])){count++;generalCount++;}
        }
      }
      const personKeys=["name","age","gender","idType","idNumber"];
      const personLabels={name:"Name",age:"Age",gender:"Gender",idType:"Photo ID Proof",idNumber:"Photo ID Number"};
      const ttdFieldNames={name:"fname",age:"age",gender:"gender",idType:"photoIdType",idNumber:"idProofNumber"};
      const used=new Set(),filledPerson=new Set();
      for(const key of personKeys){
        // ID-type selection makes the TTD React form render/replace the ID field.
        // Re-scan live controls before each field type instead of using a stale node list.
        const liveAll=fields();
        const liveSection=fieldsInSection("pilgrim details",liveAll);
        const livePilgrimFields=liveSection?.length?liveSection:liveAll;
        const exactPool=livePilgrimFields.filter(e=>e.getAttribute("name")===ttdFieldNames[key]);
        const labelledPool=controlsByVisibleLabel(personLabels[key]).filter(e=>livePilgrimFields.includes(e)&&!exactPool.includes(e));
        const pool=[...exactPool,...labelledPool,...livePilgrimFields.filter(e=>category(e)===key&&!exactPool.includes(e)&&!labelledPool.includes(e))];
        for(let i=0;i<pilgrims.length;i++){
          const el=pool[i];
          if(el&&await setValue(el,pilgrims[i]?.[key])){count++;pilgrimCount++;used.add(el);filledPerson.add(`${i}:${key}`);}
          if(key==="idNumber")await wait(75);
        }
      }

      // TTD sometimes renders labels as visual text rather than accessible labels.
      // If fields were not matched by label, locate the Pilgrim Details section and
      // map its controls in the known visual order: Name, Age, Gender, Photo ID Proof, Photo ID Number.
      const missing=personKeys.some(key=>pilgrims.some((p,i)=>p?.[key] && !pilgrimFields.filter(e=>category(e)===key)[i]));
      if(pilgrims.length && missing){
        const sectionFields=pilgrimFields;
        if(sectionFields.length>=5){
          const order=["name","age","gender","idType","idNumber"];
          for(let i=0;i<pilgrims.length;i++){
            const person=pilgrims[i];
            for(let k=0;k<order.length;k++){
              const key=order[k];
              const el=sectionFields[i*5+k];
              if(el && !used.has(el) && person?.[key] && await setValue(el,person[key])){count++;pilgrimCount++;used.add(el);filledPerson.add(`${i}:${key}`);}
            }
          }
        }
      }
      const parts=[];
      if(generalCount)parts.push(`${generalCount} General Detail field(s)`);
      if(pilgrimCount)parts.push(`${pilgrimCount} Pilgrim Detail field(s)`);
      const notFilled=[];
      pilgrims.forEach((person,i)=>personKeys.forEach(key=>{if(person?.[key]&&!filledPerson.has(`${i}:${key}`))notFilled.push(`${i+1}. ${personLabels[key]}`);}));
      const warning=notFilled.length?` Not filled: ${notFilled.join(", ")}.`:"";
      const diagnostics=controlDiagnostics(fields());
      const debug=`[v${EXT_VERSION}; ${els.length} initial control(s)]`;
      const result=count?`${debug} Verified ${parts.join(" and ")}.${warning}`:`${debug} No verified fields.${warning}`;
      sendResponse({ok:true,count,detected:els.length,notFilled,diagnostics,message:`${result} Controls: ${diagnostics}`});
    }catch(e){sendResponse({ok:false,message:"Autofill error: "+e.message});}})();
    return true;
  });
})();
