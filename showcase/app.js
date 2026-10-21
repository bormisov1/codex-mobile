const simulator=document.querySelector('#simulator');
const shell=simulator.querySelector('.sim-shell');
const screen=document.querySelector('#screen');
const title=document.querySelector('#screenTitle');
const mainLed=document.querySelector('#mainLed');
const titles={signals:'Status & notifications',composer:'Message composer',approval:'Approval drawer',threads:'Thread browser'};
let originCard=null;

function geometry(card){
  const rect=card.querySelector('.preview').getBoundingClientRect();
  const scale=Math.max(.08,Math.min(rect.width/innerWidth,rect.height/innerHeight));
  shell.style.setProperty('--dx',`${rect.left+rect.width/2-innerWidth/2}px`);
  shell.style.setProperty('--dy',`${rect.top+rect.height/2-innerHeight/2}px`);
  shell.style.setProperty('--scale',String(scale));
}

function wireSignals(){
  const toast=screen.querySelector('#sampleToast');
  const show=screen.querySelector('#showToast');
  const toggle=screen.querySelector('#toggleStatus');
  toast?.querySelector('button')?.addEventListener('click',()=>toast.classList.add('hidden'));
  show?.addEventListener('click',()=>toast.classList.remove('hidden'));
  toggle?.addEventListener('click',toggleLed);
}

function wireThreads(){
  screen.querySelectorAll('.accent-picker button').forEach(button=>button.addEventListener('click',()=>{
    document.documentElement.style.setProperty('--accent',button.dataset.accent);
    screen.querySelectorAll('.accent-picker button').forEach(choice=>choice.classList.toggle('selected',choice===button));
  }));
}

function toggleLed(){
  const green=mainLed.classList.contains('led-green');
  mainLed.classList.toggle('led-green',!green);
  mainLed.classList.toggle('led-red',green);
  document.querySelector('#metaText').textContent=green?'Moderate · Agent offline':'Moderate · Ready';
}

function openScreen(card){
  originCard=card;geometry(card);
  const name=card.dataset.screen;
  title.textContent=titles[name];
  screen.replaceChildren(document.querySelector(`#${name}`).content.cloneNode(true));
  simulator.className='simulator open entering';
  simulator.setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
  setTimeout(()=>simulator.classList.remove('entering'),620);
  if(name==='signals')wireSignals();
  if(name==='threads')wireThreads();
}

function closeScreen(){
  if(!originCard)return;
  geometry(originCard);simulator.classList.add('closing');
  setTimeout(()=>{
    simulator.className='simulator';simulator.setAttribute('aria-hidden','true');
    document.body.style.overflow='';screen.replaceChildren();originCard.focus();originCard=null;
  },350);
}

document.querySelectorAll('.design-card').forEach(card=>card.addEventListener('click',()=>openScreen(card)));
document.querySelector('#back').addEventListener('click',closeScreen);
document.querySelector('#statusButton').addEventListener('click',toggleLed);
addEventListener('keydown',event=>{if(event.key==='Escape'&&originCard)closeScreen()});
addEventListener('resize',()=>{if(originCard)geometry(originCard)});
