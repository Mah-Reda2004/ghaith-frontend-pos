import sys
import threading
import webbrowser
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from print_agent.config import config
from print_agent.printer import thermal_printer


class AgentSettings(BaseModel):
    receipt_printer_names: list[str] = Field(default_factory=list)
    barcode_printer_names: list[str] = Field(default_factory=list)
    receipt_all_printers: bool = True
    preview_when_no_printer: bool = True
    barcode_width_mm: int = Field(default=38, ge=20, le=100)
    barcode_height_mm: int = Field(default=24, ge=10, le=80)


@asynccontextmanager
async def lifespan(_app):
    thermal_printer.start()
    yield


app = FastAPI(title="Ghaith Print Agent", version="2.2.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origin_regex=r"^(https?://.+|null)$", allow_credentials=False, allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["Content-Type", "X-Ghaith-Print-Key"], expose_headers=["Access-Control-Allow-Private-Network"])


@app.middleware("http")
async def secure_local_api(request: Request, call_next):
    client_host = request.client.host if request.client else ""
    if client_host not in {"127.0.0.1", "::1", "localhost", "testclient"}:
        return HTMLResponse("Local access only", status_code=403)
    if request.method != "OPTIONS" and request.url.path.startswith("/api/print/") and request.headers.get("X-Ghaith-Print-Key") != config.api_key:
        return HTMLResponse("Unauthorized", status_code=401)
    response = await call_next(request)
    if request.headers.get("Access-Control-Request-Private-Network", "").lower() == "true":
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


@app.get("/health")
@app.get("/api/health")
def health():
    return {"ok": True, "service": "ghaith-print-agent", "version": "2.2.0", "printers": thermal_printer.get_printers()}


@app.get("/api/printers")
def printers():
    connected = thermal_printer.online_printers()
    connected_names = set(connected)
    queues = []
    for name in thermal_printer.physical_printers():
        details = thermal_printer.printer_details(name)
        details["connected"] = name in connected_names
        queues.append(details)
    return {
        "printers": thermal_printer.get_printers(),
        "physical": thermal_printer.physical_printers(),
        "connected": [{"name": name, "kind": thermal_printer.printer_kind(name)} for name in connected],
        "queues": queues,
        "receipt_targets": thermal_printer.receipt_targets(),
        "barcode_targets": thermal_printer.barcode_targets(),
        "receipt_printer_names": config.receipt_printer_names,
        "barcode_printer_names": config.barcode_printer_names,
    }


@app.get("/api/settings")
def get_settings():
    return {"receipt_printer_names": config.receipt_printer_names, "barcode_printer_names": config.barcode_printer_names, "receipt_all_printers": config.receipt_all_printers, "preview_when_no_printer": config.preview_when_no_printer, "barcode_width_mm": config.barcode_width_mm, "barcode_height_mm": config.barcode_height_mm}


@app.post("/api/settings")
def save_settings(settings: AgentSettings):
    available = set(thermal_printer.get_printers())
    unknown = [name for name in [*settings.receipt_printer_names, *settings.barcode_printer_names] if name not in available]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown printers: {', '.join(unknown)}")
    config.set("receipt_printer_names", list(dict.fromkeys(settings.receipt_printer_names)))
    config.set("barcode_printer_names", list(dict.fromkeys(settings.barcode_printer_names)))
    config.set("receipt_all_printers", settings.receipt_all_printers)
    config.set("preview_when_no_printer", settings.preview_when_no_printer)
    config.set("barcode_width_mm", settings.barcode_width_mm)
    config.set("barcode_height_mm", settings.barcode_height_mm)
    if not config.save():
        raise HTTPException(status_code=500, detail="Could not save settings")
    return {"ok": True}


@app.post("/api/print/receipt", status_code=202)
def print_receipt(payload: dict):
    targets = thermal_printer.receipt_targets()
    if not payload:
        raise HTTPException(status_code=400, detail="Receipt data is required")
    if not targets:
        raise HTTPException(status_code=503, detail="لا توجد طابعة إيصالات جاهزة. اختر طابعة الإيصالات من إعدادات وكيل الطباعة وتأكد من توصيلها.")
    job_id = thermal_printer.queue_receipt(payload)
    if not job_id:
        raise HTTPException(status_code=400, detail="Receipt data is required")
    return {"ok": True, "queued": True, "job_id": job_id, "printers": targets, "copies_per_printer": 1}


@app.get("/api/job-status/{job_id}")
def print_job_status(job_id: str):
    result = thermal_printer.job_status(job_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Print job not found")
    return result


@app.post("/api/print/barcode", status_code=202)
def print_barcode(payload: dict):
    if not payload.get("barcode") or not thermal_printer.queue_barcode(payload):
        raise HTTPException(status_code=400, detail="Barcode data is required")
    copies = max(1, min(int(payload.get("copies") or payload.get("quantity") or 1), 1000))
    return {"ok": True, "queued": True, "printers": thermal_printer.barcode_targets(), "copies": copies}


@app.post("/api/test-print", status_code=202)
def test_print():
    targets = thermal_printer.receipt_targets()
    if not targets:
        return {"ok": False, "queued": False, "error": "لا توجد طابعة إيصالات جاهزة."}
    job_id = thermal_printer.test_print()
    return {"ok": bool(job_id), "queued": bool(job_id), "job_id": job_id, "printers": targets}


SETTINGS_HTML = """<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>وكيل طباعة غيث</title><style>
*{box-sizing:border-box}body{font-family:Tahoma,Arial;background:#0d0d0d;color:#f5f5f5;margin:0;display:grid;place-items:center;min-height:100vh}main{width:min(760px,calc(100% - 28px));background:#1e1e1e;border:1px solid #343434;border-radius:16px;padding:28px;box-shadow:0 24px 70px #0009}h1{color:#ff7900;margin:0 0 6px}.status{color:#22c55e;margin-bottom:24px}.printer{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;align-items:center;padding:13px;background:#292929;border:1px solid #383838;border-radius:10px;margin:8px 0}.note{color:#aaa;font-size:14px;line-height:1.7}.queue-state{grid-column:1/-1;color:#aaa;font-size:12px}.queue-state.is-error{color:#fbbf24}.route{padding:10px;background:#292929;border-radius:8px;font-size:13px;line-height:1.7}button{border:0;border-radius:9px;padding:11px 18px;font-weight:700;cursor:pointer}.primary{background:#ff7900;color:white}.secondary{background:#383838;color:white;margin-inline-start:8px}#msg{min-height:24px;margin-top:14px;color:#22c55e}.role{display:flex;gap:7px;align-items:center}.offline{color:#fbbf24;font-size:12px}
</style></head><body><main><h1>غيث — وكيل الطباعة</h1><div class="status">● الخدمة تعمل على هذا الجهاز</div><p class="note">حدد وظيفة كل تعريف طابعة. يمكن اختيار نفس الطابعة للإيصالات والليبل إذا كانت 2 في 1؛ سيستخدم التطبيق اختيارك بدل التخمين من اسم التعريف.</p><h3>توجيه الطابعات</h3><div id="printers">جاري فحص الطابعات...</div><p><button class="primary" onclick="saveSettings()">حفظ التوجيه</button><button class="secondary" onclick="testPrint()">طباعة إيصال تجريبي</button></p><div id="msg" role="status"></div><script>
const p=document.getElementById('printers'),m=document.getElementById('msg');let agentSettings={};const esc=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');async function load(){const [pr,sr]=await Promise.all([fetch('/api/printers'),fetch('/api/settings')]);const d=await pr.json();agentSettings=await sr.json();const online=new Set(d.connected.map(x=>x.name)),queues=new Map((d.queues||[]).map(x=>[x.name,x]));const receiptDefaults=new Set(agentSettings.receipt_printer_names.length?agentSettings.receipt_printer_names:d.receipt_targets);const barcodeDefaults=new Set(agentSettings.barcode_printer_names.length?agentSettings.barcode_printer_names:d.barcode_targets);const describe=name=>{const q=queues.get(name);if(!q)return'حالة USB غير معروفة';const connection=q.connected?`متصلة على ${q.port||'USB'}`:'غير متصلة';const state=q.status_labels?.length?q.status_labels.join('، '):'تعريف الطابعة جاهز';const pending=q.pending_jobs?` · ${q.pending_jobs} أوامر في قائمة الانتظار`:'';return`${connection} · ${state}${pending}`};const route=names=>names.length?names.map(name=>`${name}${queues.get(name)?.port?` (${queues.get(name).port})`:''}`).join('، '):'غير محددة';p.innerHTML=(d.physical.length?d.physical.map(name=>`<div class="printer"><strong>${esc(name)}</strong><label class="role"><input type="checkbox" data-role="receipt" value="${esc(name)}" ${receiptDefaults.has(name)?'checked':''}>إيصالات</label><label class="role"><input type="checkbox" data-role="barcode" value="${esc(name)}" ${barcodeDefaults.has(name)?'checked':''}>ليبل / باركود</label><small class="queue-state${queues.get(name)?.status_labels?.length?' is-error':''}">${esc(describe(name))}</small></div>`).join(''):'لا توجد طابعات فعلية مثبّتة في Windows.')+`<p class="route">مسار الإيصالات: ${esc(route(d.receipt_targets||[]))}<br>مسار الباركود: ${esc(route(d.barcode_targets||[]))}</p>`;}async function saveSettings(){const receipt_printer_names=[...p.querySelectorAll('[data-role="receipt"]:checked')].map(x=>x.value);const barcode_printer_names=[...p.querySelectorAll('[data-role="barcode"]:checked')].map(x=>x.value);const r=await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...agentSettings,receipt_printer_names,barcode_printer_names})});const d=await r.json();m.textContent=r.ok?'تم حفظ توجيه الطباعة.':(d.detail||'تعذر حفظ الإعدادات.');if(r.ok)await load();}async function testPrint(){m.textContent='جاري إرسال الإيصال التجريبي...';const r=await fetch('/api/test-print',{method:'POST'});const d=await r.json();if(!r.ok||!d.job_id){m.textContent=d.error||'لا توجد طابعة إيصالات جاهزة.';return;}for(let i=0;i<60;i++){await new Promise(resolve=>setTimeout(resolve,500));const s=await fetch('/api/job-status/'+encodeURIComponent(d.job_id)).then(x=>x.json());if(s.state==='completed'){m.textContent='تم تسليم الإيصال إلى: '+s.printers.join('، ');return;}if(s.state==='failed'){m.textContent='فشلت الطباعة: '+(s.error||'تحقق من إعداد الطابعة والورق.');return;}}m.textContent='أمر الطباعة ما زال قيد التنفيذ؛ لم يصل تأكيد نهائي بعد.';}load().catch(()=>p.textContent='تعذر قراءة الطابعات');
</script></main></body></html>"""


@app.get("/", response_class=HTMLResponse)
def settings_page(): return SETTINGS_HTML


def main():
    if "--background" not in sys.argv:
        threading.Timer(1.0, lambda: webbrowser.open(f"http://127.0.0.1:{config.local_port}")).start()
    uvicorn.run(app, host="127.0.0.1", port=config.local_port, log_config=None, access_log=False, log_level="critical")


if __name__ == "__main__": main()
