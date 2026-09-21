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
    barcode_printer_names: list[str] = Field(default_factory=list)
    receipt_all_printers: bool = True
    preview_when_no_printer: bool = True


@asynccontextmanager
async def lifespan(_app):
    thermal_printer.start()
    yield


app = FastAPI(title="Ghaith Print Agent", version="2.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origin_regex=r"^(https?://.+|null)$", allow_credentials=False, allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["Content-Type", "X-Ghaith-Print-Key"], expose_headers=["Access-Control-Allow-Private-Network"])


@app.middleware("http")
async def secure_local_api(request: Request, call_next):
    client_host = request.client.host if request.client else ""
    if client_host not in {"127.0.0.1", "::1", "localhost", "testclient"}:
        return HTMLResponse("Local access only", status_code=403)
    if request.method != "OPTIONS" and request.url.path.startswith("/api/print") and request.headers.get("X-Ghaith-Print-Key") != config.api_key:
        return HTMLResponse("Unauthorized", status_code=401)
    response = await call_next(request)
    if request.headers.get("Access-Control-Request-Private-Network", "").lower() == "true":
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


@app.get("/health")
@app.get("/api/health")
def health():
    return {"ok": True, "service": "ghaith-print-agent", "version": "2.0.0", "printers": thermal_printer.get_printers()}


@app.get("/api/printers")
def printers():
    connected = thermal_printer.online_printers()
    return {
        "printers": thermal_printer.get_printers(),
        "physical": thermal_printer.physical_printers(),
        "connected": [{"name": name, "kind": thermal_printer.printer_kind(name)} for name in connected],
        "receipt_targets": thermal_printer.receipt_targets(),
        "barcode_targets": thermal_printer.barcode_targets(),
    }


@app.get("/api/settings")
def get_settings():
    return {"barcode_printer_names": config.barcode_printer_names, "receipt_all_printers": config.receipt_all_printers, "preview_when_no_printer": config.preview_when_no_printer}


@app.post("/api/settings")
def save_settings(settings: AgentSettings):
    available = set(thermal_printer.get_printers())
    unknown = [name for name in settings.barcode_printer_names if name not in available]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown printers: {', '.join(unknown)}")
    config.set("barcode_printer_names", list(dict.fromkeys(settings.barcode_printer_names)))
    config.set("receipt_all_printers", settings.receipt_all_printers)
    config.set("preview_when_no_printer", settings.preview_when_no_printer)
    if not config.save():
        raise HTTPException(status_code=500, detail="Could not save settings")
    return {"ok": True}


@app.post("/api/print/receipt", status_code=202)
def print_receipt(payload: dict):
    if not thermal_printer.queue_receipt(payload):
        raise HTTPException(status_code=400, detail="Receipt data is required")
    return {"ok": True, "queued": True, "printers": thermal_printer.receipt_targets(), "copies_per_printer": 1}


@app.post("/api/print/barcode", status_code=202)
def print_barcode(payload: dict):
    if not thermal_printer.queue_barcode(payload):
        raise HTTPException(status_code=400, detail="Barcode data is required")
    copies = max(1, min(int(payload.get("copies") or payload.get("quantity") or 1), 1000))
    return {"ok": True, "queued": True, "printers": thermal_printer.barcode_targets(), "copies": copies}


@app.post("/api/test-print", status_code=202)
def test_print():
    return {"ok": thermal_printer.test_print(), "queued": True}


SETTINGS_HTML = """<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>وكيل طباعة غيث</title><style>
*{box-sizing:border-box}body{font-family:Tahoma,Arial;background:#0d0d0d;color:#f5f5f5;margin:0;display:grid;place-items:center;min-height:100vh}main{width:min(660px,calc(100% - 28px));background:#1e1e1e;border:1px solid #343434;border-radius:16px;padding:28px;box-shadow:0 24px 70px #0009}h1{color:#ff7900;margin:0 0 6px}.status{color:#22c55e;margin-bottom:24px}.printer{display:flex;gap:10px;align-items:center;padding:13px;background:#292929;border:1px solid #383838;border-radius:10px;margin:8px 0}.note{color:#aaa;font-size:14px;line-height:1.7}button{border:0;border-radius:9px;padding:11px 18px;font-weight:700;cursor:pointer}.primary{background:#ff7900;color:white}.secondary{background:#383838;color:white;margin-inline-start:8px}#msg{min-height:24px;margin-top:14px;color:#22c55e}
</style></head><body><main><h1>غيث — وكيل الطباعة</h1><div class="status">● الخدمة تعمل على هذا الجهاز</div><p class="note">يتعرف البرنامج تلقائيًا على نوع طابعة USB الموصلة ويوجّه الفواتير والباركود إلى الطابعة المناسبة.</p><h3>الطابعات المتصلة الآن</h3><div id="printers">جاري فحص الطابعات...</div><p><button class="secondary" onclick="testPrint()">طباعة فاتورة تجريبية</button></p><div id="msg"></div><script>
const p=document.getElementById('printers'),m=document.getElementById('msg');const esc=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');async function load(){const r=await fetch('/api/printers'),d=await r.json();p.innerHTML=d.connected.length?d.connected.map(x=>`<div class="printer"><span>${x.kind==='barcode'?'باركود':'فواتير'} — ${esc(x.name)}</span></div>`).join(''):'لا توجد طابعة USB متصلة الآن — سيتم التعرف عليها تلقائيًا عند توصيلها';}async function testPrint(){const r=await fetch('/api/test-print',{method:'POST'});m.textContent=r.ok?'تم إرسال الفاتورة التجريبية':'تعذر إرسال الاختبار';}load().catch(()=>p.textContent='تعذر قراءة الطابعات');
</script></main></body></html>"""


@app.get("/", response_class=HTMLResponse)
def settings_page(): return SETTINGS_HTML


def main():
    if "--background" not in sys.argv:
        threading.Timer(1.0, lambda: webbrowser.open(f"http://127.0.0.1:{config.local_port}")).start()
    uvicorn.run(app, host="127.0.0.1", port=config.local_port, log_config=None, access_log=False, log_level="critical")


if __name__ == "__main__": main()
