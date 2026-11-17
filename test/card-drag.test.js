import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../src/card-drag.js', import.meta.url), 'utf8');

function harness({ moves = [{from:'waste:0',to:'col:0'}], disabled = false, sourceKey = 'waste:0' } = {}) {
  const windowHandlers = new Map();
  const boardHandlers = new Map();
  const bodyClasses = new Set();
  const capture = new Set();
  const classes = () => ({
    add(...names) { names.forEach(name => this.owner.add(name)); },
    remove(...names) { names.forEach(name => this.owner.delete(name)); },
    contains(name) { return this.owner.has(name); },
    owner: new Set()
  });
  function element(key, rect = {left:10,top:10,width:60,height:90}) {
    const el = {
      dataset: {key}, disabled:false, style:{setProperty(name,value){this[name]=value;}},
      classList:classes(), rect, children:[], parentElement:null,
      addEventListener(){}, removeAttribute(){},
      closest(selector) {
        if (selector === '.card[data-key]' || selector === '[data-key]') return this.dataset.key ? this : null;
        if (selector === '.col') return null;
        return null;
      },
      getBoundingClientRect(){return this.rect;},
      cloneNode(){return element(undefined,this.rect);},
      append(child){this.children.push(child);child.parentElement=this;},
      remove(){this.removed=true;},
      setAttribute(){},
    };
    Object.defineProperty(el,'className',{set(value){this.classList.owner=new Set(value.split(/\s+/).filter(Boolean));}});
    return el;
  }
  const card=element(sourceKey);
  card.disabled=disabled;
  const destination=element('col:0');
  let underPointer=card;
  const board={
    contains(el){return el===card||el===destination;},
    addEventListener(name,handler){const list=boardHandlers.get(name)??[];list.push(handler);boardHandlers.set(name,list);},
    querySelector(selector){return selector.includes('col:0')?destination:null;},
    querySelectorAll(selector){
      const elements=[card,destination];
      return selector.split(',').flatMap(token=>elements.filter(el=>token.trim().split('.').filter(Boolean).every(cls=>el.classList.contains(cls))));
    },
    setPointerCapture(id){capture.add(id);},hasPointerCapture(id){return capture.has(id);},releasePointerCapture(id){capture.delete(id);},
    emit(name,event){for(const handler of boardHandlers.get(name)??[])handler(event);}
  };
  const body={classList:{add:(n)=>bodyClasses.add(n),remove:(n)=>bodyClasses.delete(n)},append(){}};
  const document={body,createElement:()=>element(undefined),elementFromPoint:()=>underPointer};
  const window={addEventListener(name,handler){const list=windowHandlers.get(name)??[];list.push(handler);windowHandlers.set(name,list);}};
  const context={Set,Math,document,window,setTimeout,console};
  vm.runInNewContext(source.replace('export function attachCardDrag','function attachCardDrag')+';globalThis.attachCardDrag=attachCardDrag;',context);
  const events=[];
  const drag=context.attachCardDrag(board,{
    getMoves:()=>moves,
    onStart:()=>events.push('start'),
    onDrop:(from,to)=>events.push(['drop',from,to]),
    onCancel:()=>events.push('cancel')
  });
  const pointer={pointerId:7,pointerType:'touch',isPrimary:true,button:0,clientX:20,clientY:20,preventDefault(){this.defaultPrevented=true;}};
  board.emit('pointerdown',{...pointer,target:card});
  const win=(name,event)=>{for(const handler of windowHandlers.get(name)??[])handler(event);};
  const move=(x,y)=>{underPointer=destination;win('pointermove',{...pointer,clientX:x,clientY:y});};
  const lost=(target)=>board.emit('lostpointercapture',{...pointer,target});
  const up=(x=30,y=30)=>{underPointer=destination;win('pointerup',{...pointer,clientX:x,clientY:y});};
  return {events,card,destination,bodyClasses,capture,drag,move,lost,up,win,pointer,board};
}

test('a touch drag survives bubbled lost capture from its card and drops on a legal target',()=>{
  const h=harness();
  h.move(30,30);
  h.lost({closest:selector=>h.card.closest(selector)});
  assert.deepEqual(h.events,['start']);
  assert.equal(h.bodyClasses.has('dragging-cards'),true);
  h.up();
  assert.deepEqual(h.events,['start',['drop','waste:0','col:0']]);
  assert.equal(h.bodyClasses.has('dragging-cards'),false);
});

test('lost pointer capture on the board cancels and cleans up an active drag',()=>{
  const h=harness();
  h.move(30,30);
  h.lost(h.board);
  assert.deepEqual(h.events,['start','cancel']);
  assert.equal(h.bodyClasses.has('dragging-cards'),false);
  assert.equal(h.capture.has(7),false);
});

test('pointer cancellation cleans up an active drag',()=>{
  const h=harness();
  h.move(30,30);
  h.win('pointercancel',{...h.pointer,clientX:30,clientY:30});
  assert.deepEqual(h.events,['start','cancel']);
  assert.equal(h.bodyClasses.has('dragging-cards'),false);
});

test('a touch tap below the drag threshold does not start a drag',()=>{
  const h=harness();
  h.move(24,24);
  h.up(24,24);
  assert.deepEqual(h.events,[]);
});

test('a card with no legal destination can be lifted without markers and returns on release',()=>{
  const h=harness({moves:[]});
  h.move(30,30);
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
    h.move(30,30);
    h.up();
    assert.deepEqual(h.events,[]);
    assert.equal(h.bodyClasses.has('dragging-cards'),false);
  }
});

