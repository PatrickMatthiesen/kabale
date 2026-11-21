const canonicalTarget = key => key?.startsWith('col:') ? key.split(':').slice(0,2).join(':') : key;

/** Pointer events give mouse, pen and touch the same threshold and drop rules. */
export function attachCardDrag(board, { getMoves, canLift, onStart, onDrop, onCancel }) {
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
  function hit(drag,x,y) {
    const point = document.elementFromPoint(x,y);
    if (!point || !board.contains(point)) return null;
    const keyed = point.closest('[data-key]');
    if (keyed) {
      const key = canonicalTarget(keyed.dataset.key);
      return board.contains(keyed) && drag.targets.has(key) ? key : null;
    }
    // The layout wrappers expose the felt. Other unkeyed elements can cover it.
    if (point !== board && !point.matches('.row, .reserve-group, .reserve-spacer, .pyramid-slot')) return null;

    const bounds = board.getBoundingClientRect();
    const boardLeft = bounds.left + board.clientLeft;
    const boardTop = bounds.top + board.clientTop;
    const left = Math.max(boardLeft,0);
    const top = Math.max(boardTop,0);
    const right = Math.min(boardLeft + board.clientWidth,window.innerWidth);
    const bottom = Math.min(boardTop + board.clientHeight,window.innerHeight);
    if (x < left || x >= right || y < top || y >= bottom) return null;
    let nearest = null, nearestDistance = Infinity;
    for (const key of drag.targets) {
      const target = board.querySelector(`[data-key="${key}"]`);
      if (!target) continue;
      const rect = target.getBoundingClientRect();
      const targetLeft = Math.max(rect.left,left), targetRight = Math.min(rect.right,right);
      const targetTop = Math.max(rect.top,top), targetBottom = Math.min(rect.bottom,bottom);
      if (targetLeft >= targetRight || targetTop >= targetBottom) continue;
      const dx = Math.max(targetLeft-x,0,x-targetRight);
      const dy = Math.max(targetTop-y,0,y-targetBottom);
      const distance = Math.hypot(dx,dy);
      if (distance > nearestDistance) continue;
      nearest = distance === nearestDistance ? null : key;
      nearestDistance = distance;
    }
    return nearestDistance <= drag.edgeTolerance ? nearest : null;
  }
  function move(event) {
    const drag = gesture;
    if (!drag || drag.id !== event.pointerId || drag.blocked) return;
    if (!drag.preview) {
      if (Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<8) return;
      if (canLift?.(drag.from,drag.targets) === false) {
        drag.blocked=true;
        return;
      }
      onStart();
      const rect=drag.element.getBoundingClientRect();
      const preview=document.createElement('div');
      preview.className='drag-preview';
      preview.setAttribute('aria-hidden','true');
      preview.inert=true;
      preview.style.width=`${rect.width}px`;
      drag.edgeTolerance=Math.min(24,Math.max(12,rect.width*.2));
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
    const target=hit(drag,event.clientX,event.clientY);
    if (target) board.querySelector(`[data-key="${target}"]`)?.classList.add('drop-hover');
  }
  function finish(event, cancelled=false) {
    const drag=gesture;
    if (!drag || drag.id!==event.pointerId) return;
    const active=!!drag.preview;
    const target=active&&!cancelled ? hit(drag,event.clientX,event.clientY) : null;
    cleanup();
    // A gesture that crossed the threshold can still generate a click when lift was blocked.
    if (!active && !drag.blocked) return;
    suppressClick=true;
    setTimeout(()=>{suppressClick=false;},0);
    if (!active) return;
    if (!cancelled) onDrop(drag.from,target);
    else onCancel?.();
  }
  board.addEventListener('pointerdown',event=>{
    if (gesture || event.isPrimary===false || event.button!==0) return;
    suppressClick=false;
    const element=event.target.closest('.card[data-key]');
    if (!element || element.disabled || element.dataset.key==='stock') return;
    const from=element.dataset.key;
    const targets=new Set(getMoves().filter(move=>move.from===from).map(move=>canonicalTarget(move.to)));
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
  window.addEventListener('blur',()=>{
    if (gesture) finish({pointerId:gesture.id},true);
  });
  window.addEventListener('resize',cleanup);
  return { cancel:cleanup };
}
