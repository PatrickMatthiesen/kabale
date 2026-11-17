const canonicalTarget = key => key?.startsWith('col:') ? key.split(':').slice(0,2).join(':') : key;

/** Pointer events give mouse, pen and touch the same threshold and drop rules. */
export function attachCardDrag(board, { getMoves, onStart, onDrop, onCancel }) {
  let gesture = null, suppressClick = false;
  function cleanup() {
    const previous = gesture;
    gesture = null;
    if (!previous) return;
    previous.preview?.remove();
    previous.cards?.forEach(card => card.classList.remove('drag-source'));
    board.querySelectorAll('.drop-target,.drop-hover').forEach(el => el.classList.remove('drop-target','drop-hover'));
    document.body.classList.remove('dragging-cards');
    if (board.hasPointerCapture?.(previous.id)) board.releasePointerCapture(previous.id);
  }
  function hit(x,y) {
    const element = document.elementFromPoint(x,y)?.closest('[data-key]');
    return element && board.contains(element) ? canonicalTarget(element.dataset.key) : null;
  }
  function move(event) {
    const drag = gesture;
    if (!drag || drag.id !== event.pointerId) return;
    if (!drag.preview) {
      if (Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<8) return;
      onStart();
      const rect=drag.element.getBoundingClientRect();
      const preview=document.createElement('div');
      preview.className='drag-preview';
      preview.setAttribute('aria-hidden','true');
      preview.inert=true;
      preview.style.width=`${rect.width}px`;
      preview.style.setProperty('--card-h',`${rect.height}px`);
      drag.cards=[drag.element];
      if (drag.from.startsWith('col:')) {
        const start=Number(drag.from.split(':')[2]);
        drag.cards=[...drag.element.closest('.col').querySelectorAll('.card')].filter(el => Number(el.dataset.key.split(':')[2])>=start);
      }
      for (const card of drag.cards) {
        const clone=card.cloneNode(true);
        clone.removeAttribute('data-key');
        clone.removeAttribute('aria-pressed');
        clone.disabled=true;
        clone.style.top=`${card.getBoundingClientRect().top-rect.top}px`;
        clone.style.height=`${rect.height}px`;
        preview.append(clone);
        card.classList.add('drag-source');
      }
      drag.preview=preview;
      document.body.append(preview);
      document.body.classList.add('dragging-cards');
      // Window handlers still finish the gesture if capture is unavailable.
      try { board.setPointerCapture?.(event.pointerId); } catch { /* Pointer was cancelled or capture is unsupported. */ }
      for (const key of drag.targets) {
        const element=board.querySelector(`[data-key="${key}"]`);
        element?.classList.add('drop-target');
      }
    }
    event.preventDefault();
    drag.preview.style.left=`${event.clientX-drag.offsetX}px`;
    drag.preview.style.top=`${event.clientY-drag.offsetY}px`;
    board.querySelectorAll('.drop-hover').forEach(el=>el.classList.remove('drop-hover'));
    const target=hit(event.clientX,event.clientY);
    if (drag.targets.has(target)) board.querySelector(`[data-key="${target}"]`)?.classList.add('drop-hover');
  }
  function finish(event, cancelled=false) {
    const drag=gesture;
    if (!drag || drag.id!==event.pointerId) return;
    const active=!!drag.preview;
    const target=active&&!cancelled ? hit(event.clientX,event.clientY) : null;
    cleanup();
    if (!active) return;
    suppressClick=true;
    setTimeout(()=>{suppressClick=false;},0);
    if (!cancelled) onDrop(drag.from,drag.targets.has(target)?target:null);
    else onCancel?.();
  }
  board.addEventListener('pointerdown',event=>{
    if (gesture || event.isPrimary===false || event.button!==0) return;
    suppressClick=false;
    const element=event.target.closest('.card[data-key]');
    if (!element || element.disabled || element.dataset.key==='stock') return;
    const from=element.dataset.key;
    const targets=new Set(getMoves().filter(move=>move.from===from).map(move=>canonicalTarget(move.to)));
    // Picking a card up is independent of whether it has a legal destination.
    // An empty target set still allows a preview, then returns the card on drop.
    const rect=element.getBoundingClientRect();
    gesture={id:event.pointerId,element,from,targets,x:event.clientX,y:event.clientY,offsetX:event.clientX-rect.left,offsetY:event.clientY-rect.top};
  });
  board.addEventListener('click',event=>{
    if (!suppressClick) return;
    suppressClick=false;
    event.preventDefault();
    event.stopImmediatePropagation();
  },true);
  board.addEventListener('dragstart',event=>event.preventDefault());
  window.addEventListener('pointermove',move,{passive:false});
  window.addEventListener('pointerup',event=>finish(event));
  window.addEventListener('pointercancel',event=>finish(event,true));
  board.addEventListener('lostpointercapture',event=>{
    // Touch starts with implicit capture on the card. Moving capture to the
    // board releases that card and bubbles this event; the drag is still ours.
    if (event.target === board) finish(event,true);
  });
  window.addEventListener('blur',cleanup);
  window.addEventListener('resize',cleanup);
  return { cancel:cleanup };
}
