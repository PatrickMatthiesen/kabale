import assert from 'node:assert/strict';
import test from 'node:test';
import { attachFullscreen } from '../src/fullscreen.js';

function page(native = true) {
  const listeners = new Map();
  const attributes = new Map();
  const label = {};
  const doc = {addEventListener:(type,callback)=>listeners.set(type,callback)};
  const root = {ownerDocument:doc,toggleAttribute:(name,value)=>attributes.set(name,value)};
  const button = {setAttribute:(name,value)=>attributes.set(name,value),querySelector:()=>label};
  if (native) {
    root.requestFullscreen = async () => { doc.fullscreenElement=root; listeners.get('fullscreenchange')(); };
    doc.exitFullscreen = async () => { doc.fullscreenElement=null; listeners.get('fullscreenchange')(); };
  }
  let changes=0;
  const fullscreen=attachFullscreen(root,button,()=>changes++);
  return {doc,root,button,label,attributes,fullscreen,changes:()=>changes};
}

test('native fullscreen changes keep the action label and table layout in sync, including browser Escape',async()=>{
  const {doc,root,button,label,attributes,fullscreen,changes}=page();
  await button.onclick();
  assert.equal(doc.fullscreenElement,root);
  assert.equal(label.textContent,'Exit');
  assert.equal(attributes.get('data-focus-mode'),true);
  assert.equal(fullscreen.exitFallback(),false);
  await doc.exitFullscreen();
  assert.equal(attributes.get('data-focus-mode'),false);
  assert.equal(attributes.get('aria-pressed'),'false');
  assert.equal(changes(),2);
});

test('blocked and unsupported native requests still provide an escapable focus layout',async()=>{
  for (const h of [page(),page(false)]) {
    if (h.root.requestFullscreen) h.root.requestFullscreen=async()=>{throw Error('Blocked');};
    await h.button.onclick();
    assert.equal(h.attributes.get('data-focus-mode'),true);
    assert.equal(h.fullscreen.exitFallback(),true);
    assert.equal(h.attributes.get('aria-label'),'Full screen');
    await h.button.onclick();
    await h.button.onclick();
    assert.equal(h.attributes.get('data-focus-mode'),false);
  }
});
