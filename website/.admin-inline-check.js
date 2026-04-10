
const API=CONFIG.API_BASE;
let refreshInt,chartBar,chartPie;

// Dynamic auth header using session token
function getHdr() {
    const token = sessionStorage.getItem('quest_token');
    return { 'x-api-key': token || '' };
}

async function api(p){return(await fetch(`${API}${p}`,{headers:getHdr()})).json()}
async function apiPatch(p,body){
    const opts = {method:'PATCH',headers:getHdr()};
    if(body){opts.headers={...opts.headers,'Content-Type':'application/json'};opts.body=JSON.stringify(body)}
    return(await fetch(`${API}${p}`,opts)).json()
}
async function apiPost(p,b){return(await fetch(`${API}${p}`,{method:'POST',headers:{...getHdr(),'Content-Type':'application/json'},body:JSON.stringify(b)})).json()}
async function apiPut(p,b){return(await fetch(`${API}${p}`,{method:'PUT',headers:{...getHdr(),'Content-Type':'application/json'},body:JSON.stringify(b)})).json()}
async function apiDel(p){return(await fetch(`${API}${p}`,{method:'DELETE',headers:getHdr()})).json()}

// Auth — server-side password check (Issue #2)
async function doLogin(){
    const pass = document.getElementById('loginPass').value;
    if(!pass) return;
    try {
        const res = await fetch(`${API}/api/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pass }),
        });
        const data = await res.json();
        if(data.success && data.token){
            sessionStorage.setItem('quest_token', data.token);
            sessionStorage.setItem('quest_admin', '1');
            document.getElementById('loginError').style.display='none';
            showDash();
        } else {
            document.getElementById('loginError').style.display='block';
            document.getElementById('loginPass').value='';
        }
    } catch(e) {
        document.getElementById('loginError').textContent='Cannot connect to server.';
        document.getElementById('loginError').style.display='block';
    }
}
document.getElementById('loginPass').addEventListener('keypress',e=>{if(e.key==='Enter')doLogin()});
function logout(){sessionStorage.removeItem('quest_admin');sessionStorage.removeItem('quest_token');clearInterval(refreshInt);if(window._es)window._es.close();document.getElementById('dashboard').style.display='none';document.getElementById('loginGate').style.display='flex'}
function showDash(){document.getElementById('loginGate').style.display='none';document.getElementById('dashboard').style.display='block';document.getElementById('filterDate').value=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});loadOverview();connectSSE();refreshInt=setInterval(loadOverview,60000)}

// Tabs
document.querySelectorAll('.tab-btn').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.tab-btn').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.querySelectorAll('.tab-content').forEach(x=>x.classList.remove('active'));document.getElementById('tab-'+b.dataset.tab).classList.add('active');
if(b.dataset.tab==='revenue')loadRevenue();if(b.dataset.tab==='customers')loadCustomers();if(b.dataset.tab==='stations')loadStations();if(b.dataset.tab==='blocked')loadBlocked();if(b.dataset.tab==='inbox')loadInbox();if(b.dataset.tab==='feedback')loadFeedback();if(b.dataset.tab==='settings')loadSettings()}));

// SSE
function connectSSE(){if(window._es)window._es.close();const es=new EventSource(`${API}/api/admin/live`);window._es=es;
es.addEventListener('connected',()=>{document.getElementById('syncStatus').className='sync-status sync-online';document.getElementById('syncStatus').textContent='🟢 Live'});
es.addEventListener('new_booking',e=>{const b=JSON.parse(e.data);showToast(`🎮 New booking: ${b.name} — ${b.service==='ps5'?'PS5':'Pool'}`,'success');loadOverview()});
es.addEventListener('session_started',e=>{showToast(`✅ Session started: ${JSON.parse(e.data).name}`,'success');loadOverview()});
es.addEventListener('session_ended',e=>{showToast(`⏰ Session ended: ${JSON.parse(e.data).name}`,'error');loadOverview()});
es.addEventListener('booking_cancelled',e=>{showToast(`✕ Cancelled: ${JSON.parse(e.data).name}`,'info');loadOverview()});
es.addEventListener('payment_received',e=>{const d=JSON.parse(e.data);showToast(`💳 Payment: ₹${d.amount} from ${d.name}`,'success');loadOverview()});
es.addEventListener('upi_payment_pending',e=>{const d=JSON.parse(e.data);showToast(`📱 UPI payment pending verification: ${d.name} — ₹${d.amount} | Ref: ${d.reference_id}`,'info');loadOverview()});
es.onopen=()=>{document.getElementById('syncStatus').className='sync-status sync-online';document.getElementById('syncStatus').textContent='🟢 Live'};
es.onerror=()=>{document.getElementById('syncStatus').className='sync-status sync-offline';document.getElementById('syncStatus').textContent='🔴 Offline'}}

// Toast
function showToast(msg,type='success'){const t=document.createElement('div');t.className=`toast toast-${type}`;t.innerHTML=`<span>${msg}</span><button onclick="this.parentElement.remove()">×</button>`;document.getElementById('toastContainer').appendChild(t);setTimeout(()=>{if(t.parentElement)t.remove()},6000)}

// Helpers
function fmt12(t){if(!t)return'';const p=t.split(':'),h=parseInt(p[0]),m=p[1]||'00';if(h===0)return`12:${m} AM`;if(h===12)return`12:${m} PM`;return h>12?`${h-12}:${m} PM`:`${h}:${m} AM`}
function badgeH(b){const m={active:'<span class="badge badge-active">Active</span>',in_progress:'<span class="badge badge-active">In Progress</span>',upcoming:'<span class="badge badge-upcoming">Upcoming</span>',completed:'<span class="badge badge-completed">Completed</span>',cancelled:'<span class="badge badge-cancelled">Cancelled</span>',past:'<span class="badge badge-past">Past</span>'};return m[b.session_badge]||`<span class="badge">${b.status}</span>`}
function actH(b){let s='';if(b.status==='confirmed' || b.status==='active')s+=`<button class="btn-action btn-start" onclick="openTimeOverride(${b.id}, '${b.reference_id}', '${(b.session_start_time||`${b.date}T${b.time}:00`).replace(/'/g,\"&#39;\")}', '${(b.session_end_time||'').replace(/'/g,\"&#39;\")}')">⏱</button> `;if(b.status==='confirmed')s+=`<button class="btn-action btn-start" onclick="startS(${b.id})">▶</button> <button class="btn-action btn-cancel" onclick="cancelB(${b.id})">✕</button>`;if(b.status==='active')s+=`<button class="btn-action btn-done" onclick="completeS(${b.id})">✓</button>`;return s||'—'}
function stars(n){return '★'.repeat(n)+'☆'.repeat(5-n)}

// Time Override Logic
let currentOverrideId = null;
function openTimeOverride(id, ref, start, end) {
    currentOverrideId = id;
    document.getElementById('overrideRef').textContent = `Ref: ${ref}`;
    
    // Format for datetime-local (YYYY-MM-DDThh:mm)
    const formatLocal = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    };

    document.getElementById('overrideStart').value = formatLocal(start);
    document.getElementById('overrideEnd').value = formatLocal(end);
    document.getElementById('overrideError').style.display = 'none';
    document.getElementById('timeOverrideModal').style.display = 'flex';
}
function closeTimeOverride() {
    currentOverrideId = null;
    document.getElementById('timeOverrideModal').style.display = 'none';
}
async function submitTimeOverride() {
    const start = document.getElementById('overrideStart').value;
    const end = document.getElementById('overrideEnd').value;
    const errEl = document.getElementById('overrideError');
    if (!start || !end) { errEl.textContent = 'Both times are required'; errEl.style.display='block'; return; }
    
    try {
        const res = await apiPatch(`/api/admin/bookings/${currentOverrideId}/times`, { 
            session_start_time: new Date(start).toISOString(), 
            session_end_time: new Date(end).toISOString() 
        });
        if (res.success) {
            showToast('Booking times updated. Email sent.', 'success');
            closeTimeOverride();
            loadOverview();
        } else {
            errEl.textContent = res.message || 'Error updating times';
            errEl.style.display = 'block';
        }
    } catch(e) {
        errEl.textContent = 'Network error';
        errEl.style.display = 'block';
    }
}

// ===== OVERVIEW =====
async function loadOverview(){const d=document.getElementById('filterDate').value,sv=document.getElementById('filterService').value,st=document.getElementById('filterStatus').value,q=document.getElementById('filterSearch').value;
try{const stats=await api(`/api/admin/dashboard?date=${d}`);if(stats.success){document.getElementById('statTotal').textContent=stats.total_bookings;document.getElementById('statPS5').textContent=`${stats.ps5_count}/8`;document.getElementById('statPool').textContent=`${stats.pool_count}/4`;document.getElementById('statRevenue').textContent=`₹${(stats.total_revenue||0).toLocaleString('en-IN')}`;if(stats.unread_messages>0){document.getElementById('inboxBadge').textContent=stats.unread_messages;document.getElementById('inboxBadge').style.display='inline'}else{document.getElementById('inboxBadge').style.display='none'}}}catch(e){}
try{let u=`/api/admin/bookings?date=${d}`;if(sv)u+=`&service=${sv}`;if(st)u+=`&status=${st}`;if(q)u+=`&search=${encodeURIComponent(q)}`;const data=await api(u);const tb=document.getElementById('bookingsBody');if(!data.bookings||!data.bookings.length){tb.innerHTML='<tr><td colspan="11" class="empty-row">No bookings found</td></tr>';return}
tb.innerHTML=data.bookings.map(b=>{const elapsed=b.status==='active'&&b.session_start_time?`<span class="elapsed-timer" data-start="${b.session_start_time}">⏱</span>`:(b.status==='completed'&&b.session_end_time&&b.session_start_time?fmtElapsed(b.session_start_time,b.session_end_time):'—');const resource=b.station_number?` #${b.station_number}`:'';return`<tr><td style="color:var(--accent);font-weight:600">${b.reference_id}</td><td>${b.name}</td><td style="font-size:11px">${b.usn||'—'}</td><td>${b.phone}</td><td>${b.service==='ps5'?'🎮 PS5':'🎱 Pool'}${resource}</td><td>${b.service==='ps5'?'👥 '+(b.players||1):(b.pool_group_tier||'—')}</td><td>${b.date} ${fmt12(b.time)}</td><td style="font-weight:600">₹${b.total_price}${b.status==='completed'?'':'/hr'}</td><td>${badgeH(b)}</td><td>${elapsed}</td><td>${actH(b)}</td></tr>`}).join('');startElapsedTimers()}catch(e){document.getElementById('bookingsBody').innerHTML='<tr><td colspan="11" class="empty-row">Error</td></tr>'}}
async function startS(id){if(!confirm('Start session?'))return;await apiPatch(`/api/admin/bookings/${id}/start`)}
async function completeS(id){if(!confirm('Mark done?'))return;await apiPatch(`/api/admin/bookings/${id}/complete`)}
async function cancelB(id){if(!confirm('Cancel booking?'))return;await apiPatch(`/api/admin/bookings/${id}/cancel`)}

// Filter listeners
document.getElementById('filterDate').addEventListener('change',loadOverview);document.getElementById('filterService').addEventListener('change',loadOverview);document.getElementById('filterStatus').addEventListener('change',loadOverview);
let sT;document.getElementById('filterSearch').addEventListener('input',()=>{clearTimeout(sT);sT=setTimeout(loadOverview,400)});

// ===== REVENUE =====
async function loadRevenue(){const p=document.getElementById('revPeriod').value;try{const d=await api(`/api/admin/revenue?period=${p}`);const t=d.totals||{};
document.getElementById('revBody').innerHTML=`<tr><td>Total Revenue</td><td style="font-weight:700;color:var(--accent)">₹${(t.total_revenue||0).toLocaleString('en-IN')}</td></tr><tr><td>Total Bookings</td><td>${t.total_bookings||0}</td></tr><tr><td>PS5 Revenue</td><td>₹${(t.ps5_revenue||0).toLocaleString('en-IN')} (${t.ps5_bookings||0} bookings)</td></tr><tr><td>Pool Revenue</td><td>₹${(t.pool_revenue||0).toLocaleString('en-IN')} (${t.pool_bookings||0} bookings)</td></tr><tr><td>Cash</td><td>₹${(t.cash||0).toLocaleString('en-IN')}</td></tr><tr><td>UPI</td><td>₹${(t.upi||0).toLocaleString('en-IN')}</td></tr><tr><td>Online</td><td>₹${(t.online||0).toLocaleString('en-IN')}</td></tr>`;
// Bar chart
const dates=[...new Set((d.daily||[]).map(r=>r.date))].sort();const ps5Data=dates.map(dt=>(d.daily||[]).filter(r=>r.date===dt&&r.service==='ps5').reduce((s,r)=>s+r.revenue,0));const poolData=dates.map(dt=>(d.daily||[]).filter(r=>r.date===dt&&r.service==='pool').reduce((s,r)=>s+r.revenue,0));
if(chartBar)chartBar.destroy();chartBar=new Chart(document.getElementById('revenueChart'),{type:'bar',data:{labels:dates,datasets:[{label:'PS5',data:ps5Data,backgroundColor:'rgba(59,130,246,.6)'},{label:'Pool',data:poolData,backgroundColor:'rgba(99,102,241,.6)'}]},options:{responsive:true,scales:{x:{ticks:{color:'#666'}},y:{ticks:{color:'#666',callback:v=>'₹'+v}}},plugins:{legend:{labels:{color:'#aaa'}}}}});
// Pie
if(chartPie)chartPie.destroy();chartPie=new Chart(document.getElementById('pieChart'),{type:'doughnut',data:{labels:['PS5','Pool'],datasets:[{data:[t.ps5_revenue||0,t.pool_revenue||0],backgroundColor:['rgba(59,130,246,.7)','rgba(99,102,241,.7)'],borderWidth:0}]},options:{responsive:true,plugins:{legend:{labels:{color:'#aaa'}}}}});
}catch(e){console.error(e)}}

// ===== CUSTOMERS =====
async function loadCustomers(){try{const d=await api('/api/admin/customers');let custs=d.customers||[];const q=document.getElementById('custSearch').value.toLowerCase();if(q)custs=custs.filter(c=>c.name.toLowerCase().includes(q)||c.phone.includes(q));
document.getElementById('custBody').innerHTML=custs.length?custs.map(c=>`<tr><td>${c.name}</td><td>${c.phone}</td><td>${c.email||'—'}</td><td>${c.total_bookings}</td><td style="font-weight:600">₹${(c.total_spent||0).toLocaleString('en-IN')}</td><td>${c.last_visit}</td><td><span class="loyalty-badge loyalty-${c.loyalty}">${c.loyalty==='regular'?'⭐ Regular':c.loyalty==='returning'?'🔄 Returning':'🆕 New'}</span></td></tr>`).join(''):'<tr><td colspan="7" class="empty-row">No customers</td></tr>'}catch(e){}}
let cST;document.getElementById('custSearch').addEventListener('input',()=>{clearTimeout(cST);cST=setTimeout(loadCustomers,400)});

// ===== STATIONS (Issue #8 fix: single PATCH call) =====
async function loadStations(){try{const d=await api('/api/admin/stations');const g=document.getElementById('stationGrid');g.innerHTML=(d.stations||[]).map(s=>`<div class="station-card ${s.status==='maintenance'?'maint':'avail'}"><div class="type">${s.type==='ps5'?'🎮 PS5':'🎱 Pool'}</div><div class="num">#${s.number}</div><span class="badge ${s.status==='maintenance'?'badge-cancelled':'badge-active'}">${s.status==='maintenance'?'⚠️ Maintenance':'✅ Available'}</span>${s.maintenance_note?`<div style="font-size:10px;color:var(--text3);margin-top:4px">${s.maintenance_note}</div>`:''}${s.type==='ps5'?`<div style="margin-top:10px;font-size:11px"><label>Controllers:</label> <input type="number" value="${s.working_controllers}" style="width:50px;font-size:10px;padding:2px;background:var(--bg);color:white;border:1px solid var(--border);border-radius:4px" onchange="updateControllers(${s.id}, this.value)"></div>`:''}<div style="margin-top:8px"><button onclick="toggleStation(${s.id},'${s.status}')">${s.status==='maintenance'?'Set Available':'Set Maintenance'}</button></div></div>`).join('')}catch(e){}}
async function toggleStation(id,cur){
    const note=cur==='available'?prompt('Maintenance reason (optional):'):null;
    const newStatus=cur==='maintenance'?'available':'maintenance';
    await apiPatch(`/api/admin/stations/${id}`,{status:newStatus,maintenance_note:note||null});
    loadStations();
}
async function updateControllers(id, count) {
    if (count < 0 || count > 8) return;
    await apiPatch(`/api/admin/stations/${id}`,{ working_controllers: parseInt(count) });
    showToast(`Station ${id} controllers updated to ${count}`, 'success');
}

// ===== BLOCKED SLOTS =====
async function loadBlocked(){try{const d=await api('/api/admin/blocked-slots');document.getElementById('blkBody').innerHTML=(d.slots||[]).length?d.slots.map(s=>`<tr><td>${s.service}</td><td>${s.date}</td><td>${fmt12(s.start_time)}</td><td>${fmt12(s.end_time)}</td><td>${s.reason||'—'}</td><td><button class="btn-danger" onclick="rmBlock(${s.id})">Remove</button></td></tr>`).join(''):'<tr><td colspan="6" class="empty-row">No blocked slots</td></tr>'}catch(e){}}
async function addBlock(){const b={service:document.getElementById('blkService').value,date:document.getElementById('blkDate').value,start_time:document.getElementById('blkStart').value,end_time:document.getElementById('blkEnd').value,reason:document.getElementById('blkReason').value};if(!b.date){alert('Pick a date');return}await apiPost('/api/admin/blocked-slots',b);loadBlocked()}
async function rmBlock(id){if(!confirm('Remove block?'))return;await apiDel(`/api/admin/blocked-slots/${id}`);loadBlocked()}

// ===== INBOX =====
async function loadInbox(){try{const d=await api('/api/admin/contacts');const list=document.getElementById('inboxList');list.innerHTML=(d.contacts||[]).length?d.contacts.map(c=>`<div class="msg-card ${c.is_read?'':'unread'}"><div style="display:flex;justify-content:space-between;align-items:start"><div><strong>${c.name}</strong> — ${c.email}${c.subject?` — <em>${c.subject}</em>`:''}</div>${!c.is_read?`<button class="btn-action btn-done" style="font-size:10px" onclick="markRead(${c.id})">✓ Read</button>`:''}</div><p style="margin-top:6px;font-size:13px;color:var(--text2);white-space:pre-wrap">${c.message}</p><div class="meta">${c.created_at}</div></div>`).join(''):'<p class="empty-row">No messages</p>'}catch(e){}}
async function markRead(id){await apiPatch(`/api/admin/contacts/${id}/read`);loadInbox();loadOverview()}

// ===== FEEDBACK (Issue #13) =====
async function loadFeedback(){
    try{
        const d=await api('/api/admin/feedback');
        const fb=d.feedback||[];
        // Calculate averages
        if(fb.length>0){
            const avg=(key)=>(fb.reduce((s,f)=>s+f[key],0)/fb.length).toFixed(1);
            document.getElementById('feedbackSummary').innerHTML=`<strong>${fb.length}</strong> total responses &nbsp;|&nbsp; Overall: <strong style="color:var(--accent)">${avg('overall')}</strong> ★ &nbsp;|&nbsp; Quality: <strong>${avg('quality')}</strong> ★ &nbsp;|&nbsp; Staff: <strong>${avg('staff')}</strong> ★ &nbsp;|&nbsp; Value: <strong>${avg('value')}</strong> ★`;
        } else {
            document.getElementById('feedbackSummary').textContent='No feedback yet.';
        }
        document.getElementById('feedbackBody').innerHTML=fb.length?fb.map(f=>`<tr><td style="font-size:11px">${f.created_at||'—'}</td><td style="color:var(--accent);font-size:11px">${f.booking_ref||'—'}</td><td style="color:var(--accent)">${stars(f.overall)}</td><td>${stars(f.quality)}</td><td>${stars(f.staff)}</td><td>${stars(f.value)}</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(f.comment||'').replace(/"/g,'&quot;')}">${f.comment||'—'}</td></tr>`).join(''):'<tr><td colspan="7" class="empty-row">No feedback yet</td></tr>';
    }catch(e){console.error(e)}
}

// ===== SETTINGS =====
async function loadSettings(){try{const d=await api('/api/admin/settings');const s=d.settings||{};for(const[k,v]of Object.entries(s)){const el=document.getElementById('set_'+k);if(el)el.value=v}}catch(e){}}
async function saveSettings(){const keys=['ps5_rate_morning','ps5_rate_afternoon','pool_rate_morning','pool_rate_afternoon','ps5_capacity','pool_capacity','weekday_open','weekday_close','weekend_open','weekend_close','whatsapp_number','admin_email','upi_id','pool_rate_2plus','pool_rate_4plus','pool_rate_8plus','buffer_time'];const obj={};keys.forEach(k=>{const el=document.getElementById('set_'+k);if(el)obj[k]=el.value});await apiPut('/api/admin/settings',obj);showToast('Settings saved!','success')}

// Elapsed timer helpers
function fmtElapsed(start,end){try{const s=new Date(start),e=new Date(end);const ms=e-s;if(ms<0)return'—';const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000);return h>0?`${h}h ${m}m`:`${m}m`}catch(e){return'—'}}
function startElapsedTimers(){document.querySelectorAll('.elapsed-timer').forEach(el=>{const st=el.dataset.start;if(!st)return;const startDate=new Date(st);function tick(){const now=new Date();const ms=now-startDate;if(ms<0){el.textContent='—';return}const h=Math.floor(ms/3600000);const m=Math.floor((ms%3600000)/60000);const s=Math.floor((ms%60000)/1000);el.textContent=`⏱ ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}tick();setInterval(tick,1000)})}


// Init
if(sessionStorage.getItem('quest_admin')==='1' && sessionStorage.getItem('quest_token'))showDash();
