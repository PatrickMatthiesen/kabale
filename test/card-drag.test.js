import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../src/card-drag.js', import.meta.url), 'utf8');

function harness({ moves = [{from:'waste:0',to:'col:0'}], disabled = false, sourceKey = 'waste:0', pointerType = 'touch', overlay, canLift, viewportHeight = 400 } = {}) {
  const windowHandlers = new Map();
  const boardHandlers = new Map();
  const capture = new Set();
  const classes = () => ({
    add(...names) { names.forEach(name => this.owner.add(name)); },
    remove(...names) { names.forEach(name => this.owner.delete(name)); },
    contains(name) { return this.owner.has(name); },
    owner: new Set()
  });
  function element(key, rect = {}) {
    const {left=10,top=10,width=60,height=90} = rect;
    const el = {
      dataset: {key}, disabled:false, style:{setProperty(name,value){this[name]=value;}},
      classList:classes(), rect:{left,top,width,height,right:left+width,bottom:top+height}, children:[], parentElement:null,
      addEventListener(){}, removeAttribute(){},
      matches(selector) {
        if (selector === '[data-key]') return Boolean(this.dataset.key);
        if (selector === '.card[data-key]') return this.classList.contains('card') && Boolean(this.dataset.key);
        if (selector.startsWith('[data-key="')) return this.dataset.key === selector.slice(11,-2);
        return selector.split(',').some(token=>this.classList.contains(token.trim().slice(1)));
      },
      closest(selector) {
        return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null;
      },
      contains(child){return child === this || Boolean(child.parentElement && this.contains(child.parentElement));},
      querySelectorAll(selector){return this.children.flatMap(child=>[
        ...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)
      ]);},
      querySelector(selector){return this.querySelectorAll(selector)[0] ?? null;},
      getBoundingClientRect(){return this.rect;},
      cloneNode(){return element(undefined,this.rect);},
      append(child){this.children.push(child);child.parentElement=this;},
      remove(){this.removed=true;},
      setAttribute(){},
    };
    Object.defineProperty(el,'className',{set(value){this.classList.owner=new Set(value.split(/\s+/).filter(Boolean));}});
    return el;
  }
  function hitTest(element,x,y) {
    const {left,right,top,bottom}=element.getBoundingClientRect();
    if (element.removed || element.classList.contains('drag-preview') || element.classList.contains('drag-source') || x<left || x>=right || y<top || y>=bottom) return null;
    for (const child of element.children.toReversed()) {
      const hit=hitTest(child,x,y);
      if (hit) return hit;
    }
    return element;
  }
  const isColumn=sourceKey.startsWith('col:');
  const card=element(sourceKey,{top:isColumn ? 110 : 10,height:isColumn ? 120 : 90});
  card.classList.add('card');
  card.disabled=disabled;
  const board=Object.assign(element(undefined,{left:8,top:8,width:340,height:232}),{
    clientLeft:0,clientTop:0,clientWidth:340,clientHeight:232,
    addEventListener(name,handler){const list=boardHandlers.get(name)??[];list.push(handler);boardHandlers.set(name,list);},
    setPointerCapture(id){capture.add(id);},hasPointerCapture(id){return capture.has(id);},releasePointerCapture(id){capture.delete(id);},
    emit(name,event){for(const handler of boardHandlers.get(name)??[])handler(event);}
  });
  const row=element(undefined,{top:110,width:330,height:130});
  row.classList.add('row','tableau');
  board.append(row);
  if (isColumn) {
    const column=element(sourceKey.split(':').slice(0,2).join(':'),card.rect);
    column.classList.add('col');
    row.append(column);
    column.append(card);
  } else board.append(card);
  const destination=element('col:0',{left:90,top:110,height:120});
  destination.append(element('col:0:4',{left:90,top:150,height:80}));
  const adjacent=element('col:1',{left:160,top:110,height:130});
  adjacent.append(element('col:1:5',{left:160,top:160,height:80}));
  row.append(destination);
  row.append(adjacent);
  const body=element(undefined,{left:0,top:0,width:500,height:400});
  body.append(board);
  if (overlay) (overlay === 'inside' ? board : body).append(element(undefined,{left:100,top:224,width:30,height:16}));
  const document={body,createElement:()=>element(undefined),elementFromPoint:(x,y)=>hitTest(body,x,y)};
  const window={innerWidth:500,innerHeight:viewportHeight,addEventListener(name,handler){const list=windowHandlers.get(name)??[];list.push(handler);windowHandlers.set(name,list);}};
  const context={Set,Math,document,window,setTimeout,console};
  vm.runInNewContext(source.replace('export function attachCardDrag','function attachCardDrag')+';globalThis.attachCardDrag=attachCardDrag;',context);
  const events=[];
  const drag=context.attachCardDrag(board,{
    getMoves:()=>moves,
    canLift,
    onStart:()=>events.push('start'),
    onDrop:(from,to)=>events.push(['drop',from,to]),
    onCancel:()=>events.push('cancel')
  });
  const pointer={pointerId:7,pointerType,isPrimary:true,button:0,clientX:20,clientY:card.rect.top+10,preventDefault(){this.defaultPrevented=true;}};
  board.emit('pointerdown',{...pointer,target:card});
  const win=(name,event)=>{for(const handler of windowHandlers.get(name)??[])handler(event);};
  const move=(x=120,y=220)=>win('pointermove',{...pointer,clientX:x,clientY:y});
  const lost=(target)=>board.emit('lostpointercapture',{...pointer,target});
  const up=(x=120,y=220)=>win('pointerup',{...pointer,clientX:x,clientY:y});
  return {events,card,destination,adjacent,bodyClasses:body.classList.owner,capture,drag,move,lost,up,win,pointer,board};
}

test('a touch drag survives bubbled lost capture from its card and drops on a legal target',()=>{
  const h=harness();
  h.move();
  h.lost({closest:selector=>h.card.closest(selector)});
  assert.deepEqual(h.events,['start']);
  assert.equal(h.bodyClasses.has('dragging-cards'),true);
  h.up();
  assert.deepEqual(h.events,['start',['drop','waste:0','col:0']]);
  assert.equal(h.bodyClasses.has('dragging-cards'),false);
});

test('lost pointer capture on the board cancels and cleans up an active drag',()=>{
  const h=harness();
  h.move();
  h.lost(h.board);
  assert.deepEqual(h.events,['start','cancel']);
  assert.equal(h.bodyClasses.has('dragging-cards'),false);
  assert.equal(h.capture.has(7),false);
});

test('pointer cancellation cleans up an active drag',()=>{
  const h=harness();
  h.move();
  h.win('pointercancel',{...h.pointer,clientX:30,clientY:30});
  assert.deepEqual(h.events,['start','cancel']);
  assert.equal(h.bodyClasses.has('dragging-cards'),false);
});

test('window blur cancels an active drag and never drops the card',()=>{
  const h=harness();
  h.move();
  h.win('blur');
  h.up();
  assert.deepEqual(h.events,['start','cancel']);
  assert.equal(h.bodyClasses.has('dragging-cards'),false);
  assert.equal(h.capture.has(7),false);
});

test('a touch tap below the drag threshold does not start a drag',()=>{
  const h=harness();
  h.move(24,24);
  h.up(24,24);
  assert.deepEqual(h.events,[]);
});

test('a card with no legal destination can be lifted without markers and returns on release',()=>{
  const h=harness({moves:[]});
  h.move();
  assert.deepEqual(h.events,['start']);
  assert.equal(h.card.classList.contains('drag-source'),true);
  assert.equal(h.bodyClasses.has('dragging-cards'),true);
  assert.equal(h.destination.classList.contains('drop-target'),false);
  assert.equal(h.destination.classList.contains('drop-hover'),false);
  h.up();
  assert.deepEqual(h.events,['start',['drop','waste:0',null]]);
  assert.equal(h.card.classList.contains('drag-source'),false);
  assert.equal(h.bodyClasses.has('dragging-cards'),false);
  assert.equal(h.capture.has(7),false);
});

test('a card without legal destinations still treats a short touch as a tap',()=>{
  const h=harness({moves:[]});
  h.move(24,24);
  h.up(24,24);
  assert.deepEqual(h.events,[]);
});

test('face-down or covered cards and the stock cannot be picked up',()=>{
  for (const options of [{disabled:true},{sourceKey:'stock'}]) {
    const h=harness({...options,moves:[]});
    h.move();
    h.up();
    assert.deepEqual(h.events,[]);
    assert.equal(h.bodyClasses.has('dragging-cards'),false);
  }
});

test('a mouse drag from a tableau card can hover and drop on felt just below a legal column',()=>{
  const sourceKey='col:7:0';
  const h=harness({pointerType:'mouse',sourceKey,moves:[{from:sourceKey,to:'col:0'}]});
  h.move(120,236);
  const hovered=h.destination.classList.contains('drop-hover');
  h.up(121,237);
  assert.deepEqual(h.events,['start',['drop',sourceKey,'col:0']]);
  assert.equal(hovered,true);
  assert.equal(h.destination.classList.contains('drop-hover'),false);
});

test('on felt between two legal columns the nearest wins and an equal distance clears the hover',()=>{
  const h=harness({pointerType:'mouse',moves:[{from:'waste:0',to:'col:0'},{from:'waste:0',to:'col:1'}]});
  h.move(157,220);
  assert.equal(h.adjacent.classList.contains('drop-hover'),true);
  assert.equal(h.destination.classList.contains('drop-hover'),false);
  h.move(155,220);
  assert.equal(h.adjacent.classList.contains('drop-hover'),false);
  assert.equal(h.destination.classList.contains('drop-hover'),false);
  h.up(155,220);
  assert.deepEqual(h.events,['start',['drop','waste:0',null]]);
});

test('a directly hit illegal card prevents a drop on the nearby legal column',()=>{
  const h=harness({pointerType:'mouse'});
  h.move(161,220);
  assert.equal(h.destination.classList.contains('drop-hover'),false);
  h.up(161,220);
  assert.deepEqual(h.events,['start',['drop','waste:0',null]]);
});

test('distant felt and a near point outside the board both miss on release',()=>{
  for (const [x,y] of [[260,220],[120,241]]) {
    const h=harness({pointerType:'mouse'});
    h.move(120,236);
    assert.equal(h.destination.classList.contains('drop-hover'),true);
    h.up(x,y);
    assert.deepEqual(h.events,['start',['drop','waste:0',null]]);
  }
});

test('felt near a pile entirely outside the viewport cannot target it',()=>{
  const h=harness({pointerType:'mouse',viewportHeight:224});
  h.destination.rect={...h.destination.rect,top:226};
  h.move(120,221);
  assert.equal(h.destination.classList.contains('drop-hover'),false);
  h.up(120,221);
  assert.deepEqual(h.events,['start',['drop','waste:0',null]]);
});

test('an overlay intercepts a felt hit even inside the board',()=>{
  for (const overlay of ['inside','outside']) {
    const h=harness({pointerType:'mouse',overlay});
    h.move(120,236);
    assert.equal(h.destination.classList.contains('drop-hover'),false);
    h.up(120,236);
    assert.deepEqual(h.events,['start',['drop','waste:0',null]]);
  }
});

test('the scrollbar and a fully clipped column cannot accept an edge drop',()=>{
  const h=harness({pointerType:'mouse',moves:[{from:'waste:0',to:'col:0'},{from:'waste:0',to:'col:1'}]});
  h.board.clientWidth=152;
  h.board.clientHeight=226;
  h.move(157,220);
  assert.equal(h.destination.classList.contains('drop-hover'),true);
  assert.equal(h.adjacent.classList.contains('drop-hover'),false);
  h.up(120,236);
  assert.deepEqual(h.events,['start',['drop','waste:0',null]]);
});

test('a blocked tableau run cannot use the edge drop',()=>{
  const h=harness({pointerType:'mouse',sourceKey:'col:7:0',moves:[],canLift:()=>false});
  h.move(120,236);
  h.up(120,236);
  assert.deepEqual(h.events,[]);
  assert.equal(h.capture.has(7),false);
});

