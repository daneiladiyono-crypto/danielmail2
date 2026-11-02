'use strict';
const API='https://mail123.fr/api/v1';
const $=id=>document.getElementById(id);
let session=load('daniel_mail_session',null), pollTimer=null, busy=false, toastTimer=null;

function load(k,fallback){try{const v=localStorage.getItem(k);return v?JSON.parse(v):fallback}catch{return fallback}}
function save(k,v){localStorage.setItem(k,JSON.stringify(v))}
function notify(msg){$('toast').textContent=msg;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2600)}
function setBusy(button,on){button.disabled=on;if(on){button.dataset.old=button.innerHTML;button.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Please wait...'}else if(button.dataset.old){button.innerHTML=button.dataset.old;delete button.dataset.old}}

async function api(path){
 const response=await fetch(API+path,{method:'GET',headers:{'Accept':'application/json'}});
 let data={};try{data=await response.json()}catch{}
 if(!response.ok){const e=new Error(data.error||data.message||('HTTP '+response.status));e.status=response.status;throw e}
 if(data.success===false)throw new Error(data.error||'Permintaan API gagal.');
 return data;
}
function safeText(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function showInbox(){const active=!!session?.address;$('createCard').classList.toggle('hidden',active);$('inboxCard').classList.toggle('hidden',!active);$('messagesCard').classList.toggle('hidden',!active);$('serviceStatus').textContent=active?'Active':'Standby';$('emailAddress').value=active?session.address:'';if(active)startPolling();else stopPolling()}

async function createEmail(button){
 if(busy)return;busy=true;setBusy(button,true);$('serviceStatus').textContent='Connecting';
 try{
  const data=await api('/mailbox/new');
  const address=data.address||data.mailbox?.address;
  if(!address)throw new Error('API tidak mengirim alamat email. Coba lagi nanti.');
  session={address,createdAt:Date.now()};
  save('daniel_mail_session',session);
  const history=load('daniel_mail_history',[]);
  history.unshift({address,createdAt:session.createdAt});
  save('daniel_mail_history',history.slice(0,15));
  showInbox();await refreshMessages();notify('Email berhasil dibuat!');
 }catch(e){
  notify(e.message||'Gagal membuat email. Periksa koneksi lalu coba lagi.');
  $('serviceStatus').textContent='Offline';
 }finally{busy=false;setBusy(button,false)}
}

function getMessagesPayload(data){
 if(Array.isArray(data))return data;
 if(Array.isArray(data.messages))return data.messages;
 if(Array.isArray(data.data))return data.data;
 if(Array.isArray(data.items))return data.items;
 return [];
}
function messageId(m){return m.id??m.message_id??m.uid??m.key??''}
function messageDate(m){const v=m.created_at||m.createdAt||m.date||m.received_at||m.timestamp; if(!v)return '';const d=typeof v==='number'?new Date(v>1e12?v:v*1000):new Date(v);return isNaN(d)?'':d.toLocaleDateString('id-ID')}
function senderName(m){const v=m.from??m.sender??m.from_address??'Pengirim tidak diketahui';if(typeof v==='string')return v;return v.address||v.email||v.name||'Pengirim tidak diketahui'}

async function refreshMessages(){
 if(!session?.address)return;
 try{
  $('syncLabel').innerHTML='<i class="fa-solid fa-circle-notch fa-spin"></i> Syncing';
  const data=await api('/mailbox/'+encodeURIComponent(session.address)+'/messages');
  const list=getMessagesPayload(data);
  $('messageCount').textContent=list.length;$('messageList').innerHTML='';
  if(!list.length){
   $('messageList').innerHTML='<div class="empty"><i class="fa-regular fa-envelope-open"></i><strong>Belum ada pesan</strong><p>Pesan yang masuk ke alamat ini akan muncul di sini.</p></div>';
  }else{
   for(const m of list){
    const id=messageId(m);
    const from=senderName(m);
    const subject=m.subject||m.title||'(Tanpa subjek)';
    const button=document.createElement('button');button.className='message';
    button.innerHTML='<div class="avatar"><i class="fa-regular fa-envelope"></i></div><div class="msg-copy"><div class="msg-from">'+safeText(from)+'</div><div class="msg-subject">'+safeText(subject)+'</div></div><div class="msg-date">'+safeText(messageDate(m))+'</div>';
    button.addEventListener('click',()=>readMessage(id,m));$('messageList').appendChild(button);
   }
  }
  $('syncLabel').innerHTML='<i class="fa-solid fa-circle"></i> Updated '+new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
 }catch(e){
  $('syncLabel').textContent=e.status===429?'Terlalu banyak permintaan':'Gagal sync';
 }
}

async function readMessage(id,preview){
 $('readModal').classList.add('open');$('detailBody').textContent='Memuat pesan...';
 $('detailFrom').textContent=senderName(preview||{});$('detailSubject').textContent=(preview&& (preview.subject||preview.title))||'(Tanpa subjek)';
 $('detailDate').textContent=messageDate(preview||{})||'-';
 try{
  if(!id)throw new Error('ID pesan tidak tersedia dari API.');
  const m=await api('/mailbox/'+encodeURIComponent(session.address)+'/messages/'+encodeURIComponent(id));
  const msg=m.message||m.data||m;
  $('detailFrom').textContent=senderName(msg)||senderName(preview||{});
  $('detailSubject').textContent=msg.subject||msg.title||(preview&&preview.subject)||'(Tanpa subjek)';
  $('detailDate').textContent=messageDate(msg)||messageDate(preview||{})||'-';
  const body=msg.text||msg.body||msg.content||msg.html||msg.intro||msg.snippet||'Pesan diterima, tetapi isi teks tidak tersedia.';
  $('detailBody').textContent=Array.isArray(body)?body.join('\n\n'):String(body);
 }catch(e){
  const fallback=preview&&(preview.text||preview.body||preview.content||preview.intro);
  $('detailBody').textContent=fallback?(Array.isArray(fallback)?fallback.join('\n\n'):String(fallback)):'Tidak dapat membuka pesan: '+e.message;
 }
}

function startPolling(){stopPolling();refreshMessages();pollTimer=setInterval(refreshMessages,20000)}
function stopPolling(){if(pollTimer){clearInterval(pollTimer);pollTimer=null}}
function resetSession(){stopPolling();session=null;localStorage.removeItem('daniel_mail_session');$('messageCount').textContent='0';showInbox();notify('Inbox aktif sudah diganti.')}
function showHistory(){const list=load('daniel_mail_history',[]);$('historyList').innerHTML='';if(!list.length){$('historyList').innerHTML='<div class="empty">Belum ada riwayat email di perangkat ini.</div>'}else list.forEach(item=>{const row=document.createElement('div');row.className='history-item';const span=document.createElement('span');span.textContent=item.address;const date=document.createElement('small');date.style.color='#94a3b8';date.textContent=new Date(item.createdAt).toLocaleDateString('id-ID');row.append(span,date);$('historyList').appendChild(row)});$('historyModal').classList.add('open')}

$('createBtn').addEventListener('click',()=>createEmail($('createBtn')));
$('newEmailBtn').addEventListener('click',()=>{if(confirm('Ganti email sekarang? Inbox lama tidak akan bisa dibuka lagi dari sesi ini.')){resetSession();createEmail($('createBtn'))}});
$('refreshBtn').addEventListener('click',refreshMessages);
$('copyBtn').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(session.address);notify('Alamat email berhasil disalin')}catch{$('emailAddress').select();notify('Pilih lalu salin alamat email')}});
$('historyBtn').addEventListener('click',showHistory);
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).classList.remove('open')));
document.querySelectorAll('.modal').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open')}));
$('year').textContent=new Date().getFullYear();showInbox();
