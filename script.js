const STORAGE_KEY = "focusflow_v2";
const $ = (id) => document.getElementById(id);
const now = () => Date.now();
const dateKey = (d = new Date()) => {
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
};
const state = loadState();
let timer = { mode:"pomodoro", phase:"focus", duration:25*60, remaining:25*60, running:false, endAt:null, interval:null };
let selectedPeriod = "day";
let toastTimeout;

function loadState(){
  try{
    const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(parsed && parsed.days) return parsed;
  }catch(e){}
  return {days:{}, activeDay:null, activeSession:null};
}
function save(){ localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); }
function getDay(key=dateKey()){
  if(!state.days[key]) state.days[key]={key,startAt:null,endAt:null,sessions:[]};
  return state.days[key];
}
function currentDay(){ return state.activeDay ? state.days[state.activeDay] : null; }
function isStudying(){ return !!state.activeSession; }
function formatHMS(ms){
  let sec=Math.max(0,Math.floor(ms/1000));
  const h=Math.floor(sec/3600); sec%=3600;
  const m=Math.floor(sec/60); const s=sec%60;
  return `${h}h ${m}m ${s}s`;
}
function compactTime(ms){
  let sec=Math.max(0,Math.floor(ms/1000));
  const h=Math.floor(sec/3600); sec%=3600; const m=Math.floor(sec/60);
  return `${h}h ${m}m`;
}
function clock(ms){
  let s=Math.max(0,Math.floor(ms/1000));
  const h=String(Math.floor(s/3600)).padStart(2,"0"); s%=3600;
  const m=String(Math.floor(s/60)).padStart(2,"0"); const sec=String(s%60).padStart(2,"0");
  return `${h}:${m}:${sec}`;
}
function sessionDuration(session,at=now()){ return Math.max(0,(session.endAt ?? at)-session.startAt); }
function dayStudyMs(day,at=now()){
  return (day?.sessions||[]).reduce((sum,s)=>sum+sessionDuration(s,at),0);
}
function dayTrackedMs(day,at=now()){
  if(!day?.startAt) return 0;
  return Math.max(0,(day.endAt ?? at)-day.startAt);
}
function dayBreakMs(day,at=now()){
  return Math.max(0,dayTrackedMs(day,at)-dayStudyMs(day,at));
}
function showToast(message){
  $("toast").textContent=message; $("toast").classList.add("show");
  clearTimeout(toastTimeout); toastTimeout=setTimeout(()=>$("toast").classList.remove("show"),2400);
}
function startDay(){
  if(state.activeDay){showToast("Your day is already running.");return;}
  const key=dateKey(); const day=getDay(key);
  if(day.endAt){showToast("Today's day has already ended.");return;}
  day.startAt=day.startAt||now(); state.activeDay=key; save(); render(); showToast("Your day has started. Make it count!");
}
function checkIn(){
  if(!state.activeDay){showToast("Start your day before checking in.");return;}
  if(isStudying()){showToast("You're already checked in.");return;}
  const day=currentDay();
  if(day.endAt){showToast("This day has ended.");return;}
  const session={startAt:now(),endAt:null}; day.sessions.push(session);
  state.activeSession={dayKey:state.activeDay,index:day.sessions.length-1};
  save(); render(); showToast("Study session started. You've got this!");
}
function checkOut(silent=false){
  if(!isStudying()) return;
  const active=state.activeSession, day=state.days[active.dayKey], session=day?.sessions?.[active.index];
  if(session && !session.endAt) session.endAt=now();
  state.activeSession=null; save(); render();
  if(!silent) showToast("Checked out. Enjoy your break!");
}
function endDay(){
  if(!state.activeDay){showToast("Start your day first.");return;}
  if(isStudying()) checkOut(true);
  const day=currentDay(); if(day) day.endAt=now();
  state.activeDay=null; save(); render(); showToast("Day completed. Your progress is saved!");
}
function render(){
  const today=getDay(dateKey()), active=state.activeDay===dateKey();
  $("date-text").textContent=new Date().toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric",year:"numeric"});
  $("today-label").textContent=new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"}).toUpperCase();
  $("today-study").innerHTML=formatHMS(dayStudyMs(today)).replace(/(\d+)h/, "$1<span>h</span>").replace(/(\d+)m/, "$1<span>m</span>").replace(/(\d+)s/, "$1<span>s</span>");
  $("today-break").innerHTML=compactTime(dayBreakMs(today)).replace(/(\d+)h/, "$1<span>h</span>").replace(/(\d+)m/, "$1<span>m</span>");
  $("today-sessions").textContent=today.sessions.filter(s=>s.endAt).length+(isStudying()&&state.activeSession.dayKey===dateKey()?0:0);
  $("day-tracked").textContent=today.startAt?compactTime(dayTrackedMs(today)):"Not started";
  $("start-day").disabled=!!state.activeDay || !!today.endAt;
  $("end-day").disabled=!state.activeDay;
  $("check-in").disabled=!state.activeDay || isStudying();
  $("check-out").disabled=!isStudying();
  const status=$("day-status");
  status.classList.toggle("running",!!state.activeDay);
  status.innerHTML=`<i></i> ${state.activeDay?"Day in progress":today.endAt?"Day completed":"Not started"}`;
  $("study-state-title").textContent=isStudying()?"You're in a study session":state.activeDay?"Ready for your next session":"Start your day first";
  $("study-state-subtitle").textContent=isStudying()?"Stay focused — check out when you take a break.":state.activeDay?"Check in when you begin studying.":"Your study tracking begins after Start Day.";
  const live=$("live-session"); live.classList.toggle("active",isStudying());
  $("live-label").textContent=isStudying()?"Current study session":"No active study session";
  updateLiveClock(); renderPeriod(); renderHistory();
}
function updateLiveClock(){
  if(!isStudying()){ $("live-clock").textContent="00:00:00"; return; }
  const active=state.activeSession, session=state.days[active.dayKey].sessions[active.index];
  $("live-clock").textContent=clock(now()-session.startAt);
}
function dateAtOffset(days){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+days);return d;}
function keyOf(d){return dateKey(d);}
function rangeKeys(period){
  const today=new Date(); today.setHours(0,0,0,0);
  if(period==="day") return [dateKey(today)];
  if(period==="week"){
    const start=new Date(today); start.setDate(today.getDate()-((today.getDay()+6)%7));
    return Array.from({length:7},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return keyOf(d);});
  }
  if(period==="month"){
    const start=new Date(today.getFullYear(),today.getMonth(),1);
    const count=new Date(today.getFullYear(),today.getMonth()+1,0).getDate();
    return Array.from({length:count},(_,i)=>{const d=new Date(start);d.setDate(i+1);return keyOf(d);});
  }
  const start=new Date(today.getFullYear(),0,1);
  return Array.from({length:12},(_,i)=>keyOf(new Date(start.getFullYear(),i,1)));
}
function renderPeriod(){
  const keys=rangeKeys(selectedPeriod);
  let total=0,sessions=0;
  keys.forEach(k=>{const d=state.days[k]; if(d){total+=dayStudyMs(d);sessions+=d.sessions.filter(s=>s.endAt).length;}});
  if(selectedPeriod==="day" && isStudying() && state.activeSession.dayKey===dateKey()) sessions+=0;
  $("period-label").textContent=({day:"TODAY'S TOTAL STUDY TIME",week:"THIS WEEK'S TOTAL STUDY TIME",month:"THIS MONTH'S TOTAL STUDY TIME",year:"THIS YEAR'S TOTAL STUDY TIME"})[selectedPeriod];
  $("period-total").textContent=formatHMS(total);
  $("period-sessions").textContent=`${sessions} completed ${sessions===1?"session":"sessions"}`;
  $("chart-note").textContent=({day:"Today's focused study time",week:"Daily study time · Monday to Sunday",month:"Daily study time this month",year:"Monthly study time this year"})[selectedPeriod];
  const values=keys.map(k=>dayStudyMs(state.days[k]||{sessions:[]}));
  const max=Math.max(...values,1);
  const labels=keys.map((k,i)=>{
    const d=new Date(k+"T00:00:00");
    if(selectedPeriod==="day")return "Today";
    if(selectedPeriod==="week")return d.toLocaleDateString(undefined,{weekday:"short"});
    if(selectedPeriod==="month")return String(d.getDate());
    return d.toLocaleDateString(undefined,{month:"short"});
  });
  $("study-chart").innerHTML=values.map((v,i)=>{
    const height=v===0?3:Math.max(5,(v/max)*100);
    const today=keys[i]===dateKey();
    return `<div class="chart-column"><div class="bar-area"><div class="bar ${today?"today":""}" title="${labels[i]}: ${formatHMS(v)}" style="height:${height}%"></div></div><span class="chart-label">${labels[i]}</span></div>`;
  }).join("");
}
function renderHistory(){
  const entries=Object.values(state.days).filter(d=>d.startAt||d.sessions.length).sort((a,b)=>b.key.localeCompare(a.key));
  $("history-count").textContent=`${entries.length} ${entries.length===1?"day":"days"} recorded`;
  if(!entries.length){
    $("history-list").innerHTML='<div class="empty-state"><span>✧</span><strong>Your progress will show up here</strong><small>Start a day and complete your first study session.</small></div>';return;
  }
  $("history-list").innerHTML=entries.slice(0,8).map(d=>{
    const date=new Date(d.key+"T00:00:00");
    const label=date.toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric",year:"numeric"});
    const count=d.sessions.filter(s=>s.endAt).length;
    return `<div class="history-row"><div class="history-date"><strong>${label}</strong><small>${d.endAt?"Day completed":d.startAt?"Day in progress":"Study activity"}</small></div><div class="history-time">${formatHMS(dayStudyMs(d))}</div><div class="history-sessions">${count} ${count===1?"session":"sessions"}</div></div>`;
  }).join("");
}
$("start-day").addEventListener("click",startDay);
$("end-day").addEventListener("click",endDay);
$("check-in").addEventListener("click",checkIn);
$("check-out").addEventListener("click",()=>checkOut());
document.querySelectorAll(".period-tab").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".period-tab").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");selectedPeriod=btn.dataset.period;renderPeriod();
}));

// Independent Pomodoro and custom countdown timer.
function setTimerMode(mode){
  pauseTimer(); timer.mode=mode; timer.phase="focus";
  timer.duration=mode==="pomodoro"?25*60:Number($("custom-minutes").value||45)*60;
  timer.remaining=timer.duration;
  document.querySelectorAll(".timer-tab").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode));
  $("custom-row").hidden=mode!=="custom";
  $("timer-caption").textContent=mode==="pomodoro"?"FOCUS SESSION":"CUSTOM SESSION";
  $("timer-start").textContent="Start timer";updateTimerDisplay();
  $("timer-hint").textContent=mode==="pomodoro"?"25 min focus · 5 min break. Timer runs independently of study check-in.":"Choose a duration that works for you. Timer runs independently of study check-in.";
}
function updateTimerDisplay(){
  const m=Math.floor(timer.remaining/60),s=timer.remaining%60;
  $("timer-display").textContent=`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}
function pauseTimer(){
  timer.running=false;timer.endAt=null;
  if(timer.interval)clearInterval(timer.interval);
  timer.interval=null;
}
function startTimer(){
  if(timer.running){pauseTimer();$("timer-start").textContent="Resume timer";return;}
  timer.running=true;timer.endAt=Date.now()+timer.remaining*1000;$("timer-start").textContent="Pause";
  timer.interval=setInterval(()=>{
    timer.remaining=Math.max(0,Math.ceil((timer.endAt-Date.now())/1000));updateTimerDisplay();
    if(timer.remaining<=0){
      pauseTimer();
      if(timer.mode==="pomodoro"&&timer.phase==="focus"){
        timer.phase="break";timer.duration=5*60;timer.remaining=5*60;
        $("timer-caption").textContent="BREAK TIME";$("timer-hint").textContent="Focus session complete. Take a 5-minute break!";
        $("timer-start").textContent="Start break";showToast("Focus session complete! Time for a 5-minute break.");
      }else{
        $("timer-start").textContent="Start again";showToast("Timer complete. Well done!");
        if(timer.mode==="pomodoro"){timer.phase="focus";timer.duration=25*60;timer.remaining=25*60;$("timer-caption").textContent="FOCUS SESSION";}
      }
      updateTimerDisplay();
    }
  },250);
}
$("timer-start").addEventListener("click",startTimer);
$("timer-reset").addEventListener("click",()=>{
  pauseTimer();
  timer.phase="focus";timer.duration=timer.mode==="pomodoro"?25*60:Number($("custom-minutes").value||45)*60;
  timer.remaining=timer.duration;$("timer-caption").textContent=timer.mode==="pomodoro"?"FOCUS SESSION":"CUSTOM SESSION";
  $("timer-start").textContent="Start timer";updateTimerDisplay();
});
document.querySelectorAll(".timer-tab").forEach(btn=>btn.addEventListener("click",()=>setTimerMode(btn.dataset.mode)));
$("set-custom").addEventListener("click",()=>{
  const minutes=Math.floor(Number($("custom-minutes").value));
  if(!Number.isFinite(minutes)||minutes<1||minutes>180){showToast("Choose between 1 and 180 minutes.");return;}
  pauseTimer();timer.duration=minutes*60;timer.remaining=timer.duration;timer.phase="focus";
  $("timer-caption").textContent="CUSTOM SESSION";$("timer-start").textContent="Start timer";updateTimerDisplay();showToast(`Custom timer set for ${minutes} minutes.`);
});

// Recover an unfinished session after a refresh; all timing is timestamp-based.
if(state.activeSession){
  const day=state.days[state.activeSession.dayKey], session=day?.sessions?.[state.activeSession.index];
  if(!session || session.endAt) state.activeSession=null;
}
if(state.activeDay && !state.days[state.activeDay])state.activeDay=null;
save();
render();
setInterval(()=>{if(state.activeSession){updateLiveClock();$("today-study").innerHTML=formatHMS(dayStudyMs(getDay(dateKey()))).replace(/(\d+)h/, "$1<span>h</span>").replace(/(\d+)m/, "$1<span>m</span>").replace(/(\d+)s/, "$1<span>s</span>");$("today-break").innerHTML=compactTime(dayBreakMs(getDay(dateKey()))).replace(/(\d+)h/, "$1<span>h</span>").replace(/(\d+)m/, "$1<span>m</span>");$("day-tracked").textContent=compactTime(dayTrackedMs(getDay(dateKey())));renderPeriod();}},1000);
