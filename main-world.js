(() => {
  if (window.__ttdAutofillMainBridge) return;
  window.__ttdAutofillMainBridge = true;
  const norm = value => (value || "").toLowerCase().replace(/[*:()[\]_-]/g, " ").replace(/\s+/g, " ").trim();
  const reactProps = node => {
    if (!node) return null;
    const key = Object.keys(node).find(k => k.startsWith("__reactProps$"));
    return key ? node[key] : null;
  };
  const fireHandler = (node, name) => {
    const fn = reactProps(node)?.[name];
    if (typeof fn !== "function") return false;
    const nativeEvent = new MouseEvent(name === "onMouseDown" ? "mousedown" : "click", {bubbles: true, cancelable: true, view: window});
    const event = {target: node, currentTarget: node, nativeEvent, type: nativeEvent.type, preventDefault(){nativeEvent.preventDefault();}, stopPropagation(){nativeEvent.stopPropagation();}, persist(){}};
    try { fn(event); return true; } catch (_) { return false; }
  };
  const findOption = aliases => [...document.querySelectorAll("body *")].find(node =>
    node.getClientRects().length && aliases.includes(norm(node.textContent)) &&
    ![...node.children].some(child => aliases.includes(norm(child.textContent)))
  );
  const selectOption = async (fieldName, wanted) => {
    const input = [...document.querySelectorAll(`[name="${CSS.escape(fieldName)}"]`)].find(node => node.getClientRects().length) || document.querySelector(`[name="${CSS.escape(fieldName)}"]`);
    if (!input) return false;
    const aliases = norm(wanted) === "aadhaar card" ? ["aadhaar card", "aadhaar", "aadhar"] : [norm(wanted)];
    const targets = [];
    for (let node = input, depth = 0; node && depth < 7; depth++, node = node.parentElement) {
      targets.push(node, ...node.querySelectorAll("button,svg,img,[role='button'],[class*='select'],[class*='Select'],[class*='dropdown'],[class*='Dropdown']"));
    }
    let option = findOption(aliases);
    for (const target of [...new Set(targets)]) {
      if (option) break;
      fireHandler(target, "onMouseDown");
      fireHandler(target, "onClick");
      await new Promise(resolve => setTimeout(resolve, 100));
      option = findOption(aliases);
    }
    if (!option) return false;
    for (let node = option, depth = 0; node && depth < 5; depth++, node = node.parentElement) {
      const handled = fireHandler(node, "onMouseDown") | fireHandler(node, "onClick");
      if (handled) { await new Promise(resolve => setTimeout(resolve, 200)); return true; }
    }
    return false;
  };
  window.addEventListener("message", async event => {
    if (event.source !== window || event.data?.source !== "TTD_AUTOFILL_EXTENSION" || event.data?.type !== "SELECT") return;
    const {token, fieldName, value} = event.data;
    const ok = await selectOption(fieldName, value);
    window.postMessage({source: "TTD_AUTOFILL_PAGE", type: "SELECT_RESULT", token, ok}, "*");
  });
})();
