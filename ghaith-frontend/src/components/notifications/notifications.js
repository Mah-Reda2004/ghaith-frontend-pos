import { escapeHtml } from "../../core/utils.js";
import { api, listFrom } from "../../core/api.js";
import { getUserRole } from "../../core/auth.js";

const STORAGE_KEY = "ghaith-notifications-v1";
const CHANNEL_NAME = "ghaith-notifications";
const MAX_ITEMS = 80;
let audioContext;

function isLegacyDemo(item){return["product:2","product:3"].includes(item?.entityId)||(item?.message||"").includes("بشت سماوي فاخر")||(item?.message||"").includes("طقم أزرار أكمام ملكي")}
function readItems(){try{const items=JSON.parse(localStorage.getItem(STORAGE_KEY))||[];const clean=items.filter(item=>!isLegacyDemo(item));if(clean.length!==items.length)saveItems(clean);return clean}catch{return []}}
function saveItems(items){localStorage.setItem(STORAGE_KEY,JSON.stringify(items.slice(0,MAX_ITEMS)))}
function normalize(item={}){return{id:item.id||`${Date.now()}-${Math.random().toString(16).slice(2)}`,type:item.type||"info",priority:item.priority||"info",title:String(item.title||"إشعار جديد"),message:String(item.message||""),createdAt:item.createdAt||new Date().toISOString(),read:Boolean(item.read),action:item.action||null,entityId:item.entityId||null}}

async function syncServerNotifications(){
  if(getUserRole()!=="admin")return;
  try{
    const response=await api.get("/api/v1/admin/notifications");
    const serverItems=listFrom(response).map(item=>normalize({...item,title:item.title||item.subject||item.notification_type,message:item.message||item.body||item.description,createdAt:item.created_at||item.createdAt,read:item.is_read??item.read,entityId:item.entity_id||item.entityId||`server:${item.id}`}));
    if(!serverItems.length)return;
    const localItems=readItems(),merged=[...serverItems];
    localItems.forEach(item=>{if(!merged.some(entry=>String(entry.id)===String(item.id)||entry.entityId&&entry.entityId===item.entityId))merged.push(item)});
    saveItems(merged);emitChange();
  }catch{/* صلاحيات الكاشير لا تسمح بمسار إشعارات الإدارة */}
}

function emitChange(item){window.dispatchEvent(new CustomEvent("ghaith:notifications-changed",{detail:item}));try{const channel=new BroadcastChannel(CHANNEL_NAME);channel.postMessage(item);channel.close()}catch{}}

export function publishNotification(input){
  const item=normalize(input);const items=readItems();
  const duplicate=items.find(entry=>entry.entityId&&entry.entityId===item.entityId&&entry.type===item.type&&!entry.read);
  if(duplicate){Object.assign(duplicate,item,{id:duplicate.id,createdAt:new Date().toISOString(),read:false})}else items.unshift(item);
  saveItems(items);emitChange(item);return item;
}

function iconFor(type){return type==="out_of_stock"?"×":type==="low_stock"?"!":type==="payment"?"$":type==="shift"?"↗":type==="return"?"↩":"i"}
function relativeTime(date){const minutes=Math.max(0,Math.round((Date.now()-new Date(date).getTime())/60000));if(minutes<1)return"الآن";if(minutes<60)return`منذ ${minutes} دقيقة`;const hours=Math.round(minutes/60);return hours<24?`منذ ${hours} ساعة`:`منذ ${Math.round(hours/24)} يوم`}
function playTone(priority){if(!audioContext)return;const now=audioContext.currentTime;const notes=priority==="critical"?[740,520,740]:[660,520];notes.forEach((frequency,index)=>{const oscillator=audioContext.createOscillator();const gain=audioContext.createGain();oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.0001,now+index*.13);gain.gain.exponentialRampToValueAtTime(.12,now+index*.13+.015);gain.gain.exponentialRampToValueAtTime(.0001,now+index*.13+.11);oscillator.start(now+index*.13);oscillator.stop(now+index*.13+.12)})}

export function initNotificationCenter(){
  const root=document.getElementById("notificationCenter");if(!root)return()=>{};
  const trigger=document.getElementById("notificationTrigger"),panel=document.getElementById("notificationPanel"),list=document.getElementById("notificationList"),count=document.getElementById("notificationCount"),label=document.getElementById("notificationUnreadLabel");
  const unlockAudio=()=>{if(!audioContext){const Context=window.AudioContext||window.webkitAudioContext;if(Context)audioContext=new Context()}audioContext?.resume?.()};document.addEventListener("pointerdown",unlockAudio,{once:true});
  localStorage.removeItem(`${STORAGE_KEY}:seeded`);
  const render=()=>{const items=readItems();const unread=items.filter(item=>!item.read).length;count.textContent=unread>99?"99+":String(unread);count.hidden=!unread;label.textContent=unread?`${unread} إشعار غير مقروء`:"لا توجد إشعارات جديدة";list.innerHTML=items.length?items.map(item=>`<article class="notification-item is-${escapeHtml(item.priority)}${item.read?"":" is-unread"}" data-id="${escapeHtml(item.id)}"><span class="notification-item__icon">${iconFor(item.type)}</span><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.message)}</p><small>${relativeTime(item.createdAt)}</small>${item.action?`<a href="${escapeHtml(item.action.href)}">${escapeHtml(item.action.label)}</a>`:""}</div><button type="button" data-read aria-label="${item.read?"تحديد كغير مقروء":"تحديد كمقروء"}">${item.read?"○":"●"}</button></article>`).join(""):`<div class="notification-empty"><span>✓</span><h3>كل شيء على ما يرام</h3><p>لا توجد إشعارات حاليًا.</p></div>`};
  const setOpen=open=>{panel.hidden=!open;trigger.setAttribute("aria-expanded",String(open));if(open)render()};
  const onRoot=e=>{const readButton=e.target.closest("[data-read]");if(readButton){const id=readButton.closest("[data-id]").dataset.id;const items=readItems();const item=items.find(entry=>entry.id===id);if(item)item.read=!item.read;saveItems(items);emitChange(item);render();return}if(e.target.closest("a"))setOpen(false)};
  const onDocument=e=>{if(!root.contains(e.target))setOpen(false)};
  const onKey=e=>{if(e.key==="Escape")setOpen(false)};
  const onChange=e=>{render();if(e.detail&&!e.detail.read)playTone(e.detail.priority)};
  const onStorage=e=>{if(e.key===STORAGE_KEY){render();const latest=readItems()[0];if(latest&&!latest.read)playTone(latest.priority)}};
  let channel;try{channel=new BroadcastChannel(CHANNEL_NAME);channel.onmessage=e=>{render();if(e.data&&!e.data.read)playTone(e.data.priority)}}catch{}
  trigger.addEventListener("click",e=>{e.stopPropagation();unlockAudio();setOpen(panel.hidden)});root.addEventListener("click",onRoot);document.addEventListener("click",onDocument);document.addEventListener("keydown",onKey);window.addEventListener("ghaith:notifications-changed",onChange);window.addEventListener("storage",onStorage);
  document.getElementById("notificationMarkAll").addEventListener("click",()=>{const items=readItems().map(item=>({...item,read:true}));saveItems(items);emitChange();render()});document.getElementById("notificationClear").addEventListener("click",()=>{saveItems(readItems().filter(item=>!item.read));emitChange();render()});render();syncServerNotifications();
  window.ghaithNotifications={publish:publishNotification,lowStock:product=>publishNotification({type:"low_stock",priority:"warning",title:"مخزون المنتج منخفض",message:`متبقي ${product.quantity} فقط من ${product.name}.`,entityId:`product:${product.id}`})};
  return()=>{channel?.close();root.removeEventListener("click",onRoot);document.removeEventListener("click",onDocument);document.removeEventListener("keydown",onKey);window.removeEventListener("ghaith:notifications-changed",onChange);window.removeEventListener("storage",onStorage)};
}
