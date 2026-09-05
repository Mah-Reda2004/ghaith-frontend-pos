import logging
import os
import queue
import threading
from datetime import datetime
from pathlib import Path
from typing import Any

import arabic_reshaper
import win32con
import win32print
import win32ui
from barcode import Code128
from barcode.writer import ImageWriter
from bidi.algorithm import get_display
from PIL import Image, ImageDraw, ImageFont, ImageWin

from print_agent.config import PREVIEWS_DIR, config

log = logging.getLogger("ghaith_print_agent")
log.disabled = True


def ar(value: Any) -> str:
    try:
        return get_display(arabic_reshaper.reshape(str(value or "")))
    except Exception:
        return str(value or "")


def font(size: int, bold: bool = False):
    folder = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"
    names = ["tahomabd.ttf", "arialbd.ttf"] if bold else ["tahoma.ttf", "arial.ttf"]
    for name in names:
        path = folder / name
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def draw_rtl(draw, xy, text, selected_font, anchor="ra"):
    draw.text(xy, ar(text), font=selected_font, fill="black", anchor=anchor)


def rule(draw, y, width, dashed=False):
    if dashed:
        for x in range(10, width - 10, 16):
            draw.line((x, y, min(x + 8, width - 10), y), fill="black", width=1)
    else:
        draw.line((10, y, width - 10, y), fill="black", width=2)


class PrinterManager:
    VIRTUAL_PRINTERS = ("pdf", "onenote", "xps", "fax", "microsoft print", "send to", "webex")

    def __init__(self):
        self._jobs = queue.Queue()
        self._worker = threading.Thread(target=self._run, daemon=True)
        self._worker.start()

    def start(self):
        if not self._worker.is_alive():
            self._worker = threading.Thread(target=self._run, daemon=True)
            self._worker.start()

    def get_printers(self) -> list[str]:
        try:
            flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
            return list(dict.fromkeys(item[2] for item in win32print.EnumPrinters(flags)))
        except Exception as exc:
            log.error("تعذر قراءة طابعات Windows: %s", exc)
            return []

    def physical_printers(self) -> list[str]:
        return [name for name in self.get_printers() if not any(value in name.lower() for value in self.VIRTUAL_PRINTERS)]

    def receipt_targets(self) -> list[str]:
        printers = self.physical_printers()
        if config.receipt_all_printers:
            return printers
        return printers[:1]

    def barcode_targets(self) -> list[str]:
        available = self.physical_printers()
        selected = [name for name in config.barcode_printer_names if name in available]
        if selected:
            return selected
        try:
            default = win32print.GetDefaultPrinter()
            if default in available:
                return [default]
        except Exception:
            pass
        return available[:1]

    def queue_receipt(self, payload: dict) -> bool:
        if not payload:
            return False
        self._jobs.put({"kind": "receipt", "payload": payload, "copies": 1})
        return True

    def queue_barcode(self, payload: dict) -> bool:
        if not payload:
            return False
        copies = max(1, min(int(payload.get("copies") or payload.get("quantity") or 1), 1000))
        self._jobs.put({"kind": "barcode", "payload": payload, "copies": copies})
        return True

    def test_print(self) -> bool:
        return self.queue_receipt({
            "title": "فاتورة تجريبية",
            "number": "TEST-0001",
            "customer": "عميل تجريبي",
            "cashier": "مدير النظام",
            "items": [{"name": "منتج تجريبي", "sku": "TEST-SKU", "qty": 2, "price": 50}],
            "totals": [{"label": "الإجمالي النهائي", "value": 100, "final": True}],
            "payment": "نقدي",
        })

    def render_receipt(self, data: dict) -> Image.Image:
        dpi = config.dpi
        width = round(config.receipt_width_mm / 25.4 * dpi)
        items = data.get("items") or []
        totals = data.get("totals") or []
        image = Image.new("L", (width, 680 + len(items) * 92 + len(totals) * 48), "white")
        draw = ImageDraw.Draw(image)
        logo, heading, normal, small, bold = font(42, True), font(28, True), font(22), font(18), font(22, True)
        y = 18
        draw_rtl(draw, (width // 2, y), "غيث", logo, "ma"); y += 52
        draw_rtl(draw, (width // 2, y), "للزي الإسلامي الراقي", normal, "ma"); y += 34
        draw_rtl(draw, (width // 2, y), data.get("title", "فاتورة مبيعات"), heading, "ma"); y += 42
        number = str(data.get("number") or "—")
        stamp = datetime.now()
        draw.text((12, y), number, font=small, fill="black", anchor="la")
        draw_rtl(draw, (width - 12, y), data.get("date") or stamp.strftime("%Y-%m-%d"), small); y += 27
        draw.text((12, y), str(data.get("time") or stamp.strftime("%H:%M")), font=small, fill="black", anchor="la"); y += 26
        rule(draw, y, width, True); y += 20
        for label, key in (("العميل", "customer"), ("الكاشير", "cashier"), ("السيلز", "sales"), ("الدفع", "payment")):
            if data.get(key):
                draw_rtl(draw, (width - 12, y), f"{label}: {data[key]}", bold); y += 31
        rule(draw, y, width, True); y += 23
        draw_rtl(draw, (width - 12, y), "الصنف", bold)
        draw_rtl(draw, (int(width * .34), y), "عدد", bold)
        draw_rtl(draw, (12, y), "الإجمالي", bold, "la"); y += 32
        rule(draw, y, width); y += 17
        for item in items:
            name = str(item.get("name") or "صنف")
            shown = name[:34] + ("…" if len(name) > 34 else "")
            draw_rtl(draw, (width - 12, y), shown, normal)
            qty = float(item.get("qty") or item.get("quantity") or 1)
            draw.text((int(width * .32), y), f"{qty:g}", font=normal, fill="black", anchor="ma")
            price = float(item.get("price") or item.get("unit_price") or 0)
            total = float(item.get("total") or price * qty)
            draw.text((12, y), f"{total:,.2f}", font=bold, fill="black", anchor="la")
            if item.get("sku"):
                draw.text((width - 12, y + 27), str(item["sku"]), font=small, fill="black", anchor="ra")
            y += 61; rule(draw, y, width, True); y += 13
        rule(draw, y, width); y += 22
        for total in totals:
            final = bool(total.get("final"))
            selected = heading if final else normal
            draw_rtl(draw, (width - 12, y), total.get("label", "الإجمالي"), selected)
            value = float(total.get("value") or 0)
            prefix = "- " if total.get("negative") else ""
            draw.text((12, y), f"{prefix}{value:,.2f} {total.get('currency', 'ج.م')}", font=heading if final else bold, fill="black", anchor="la")
            y += 46
        rule(draw, y, width, True); y += 23
        if data.get("note"):
            draw_rtl(draw, (width // 2, y), str(data["note"])[:55], small, "ma"); y += 32
        draw_rtl(draw, (width // 2, y), "شكرًا لزيارتكم", heading, "ma"); y += 38
        draw_rtl(draw, (width // 2, y), "احتفظ بالفاتورة للاستبدال أو الاسترجاع", small, "ma"); y += 34
        draw.text((width // 2, y), f"*{number}*", font=small, fill="black", anchor="ma")
        return image.crop((0, 0, width, y + 30))

    def render_barcode(self, data: dict) -> Image.Image:
        dpi = config.dpi
        width = round(config.barcode_width_mm / 25.4 * dpi)
        height = round(config.barcode_height_mm / 25.4 * dpi)
        image = Image.new("L", (width, height), "white")
        draw, small, bold = ImageDraw.Draw(image), font(16), font(20, True)
        draw_rtl(draw, (width // 2, 7), "غيث", bold, "ma")
        draw_rtl(draw, (width // 2, 32), str(data.get("name") or "منتج غيث")[:32], small, "ma")
        sku = str(data.get("sku") or data.get("barcode") or "000000")
        code = Code128(sku, writer=ImageWriter()).render({"module_height": 8, "module_width": .23, "quiet_zone": 1, "font_size": 0, "text_distance": 0, "dpi": dpi}).convert("L")
        code.thumbnail((width - 28, max(35, height - 125)))
        code_y = 54
        image.paste(code, ((width - code.width) // 2, code_y))
        sku_y = min(code_y + code.height + 10, height - 48)
        draw.text((width // 2, sku_y), sku, font=small, fill="black", anchor="ma")
        if data.get("price") not in (None, ""):
            draw_rtl(draw, (width // 2, min(sku_y + 43, height - 6)), f"{data['price']} ج.م", bold, "md")
        return image

    def _print_image(self, image: Image.Image, printer_name: str, document_name: str):
        dc = win32ui.CreateDC()
        try:
            dc.CreatePrinterDC(printer_name)
            printable_width = dc.GetDeviceCaps(win32con.HORZRES)
            scale = printable_width / image.width
            target = (0, 0, printable_width, int(image.height * scale))
            dc.StartDoc(document_name); dc.StartPage()
            ImageWin.Dib(image.convert("RGB")).draw(dc.GetHandleOutput(), target)
            dc.EndPage(); dc.EndDoc()
        finally:
            dc.DeleteDC()

    def _save_preview(self, image: Image.Image, kind: str, copies: int):
        path = PREVIEWS_DIR / f"{kind}-{datetime.now().strftime('%Y%m%d-%H%M%S-%f')}-x{copies}.png"
        image.save(path)
        log.info("تم حفظ معاينة %s (%s نسخة): %s", kind, copies, path)

    def _run(self):
        while True:
            job = self._jobs.get()
            try:
                kind, payload, copies = job["kind"], job["payload"], job["copies"]
                image = self.render_receipt(payload) if kind == "receipt" else self.render_barcode(payload)
                targets = self.receipt_targets() if kind == "receipt" else self.barcode_targets()
                if not targets:
                    if config.preview_when_no_printer:
                        self._save_preview(image, kind, copies)
                    else:
                        log.error("لا توجد طابعة فعلية متصلة")
                    continue
                for printer_name in targets:
                    repeat = 1 if kind == "receipt" else copies
                    for copy_number in range(repeat):
                        self._print_image(image, printer_name, f"Ghaith {payload.get('number') or payload.get('sku') or kind}")
                    log.info("تمت طباعة %s على %s بعدد %s", kind, printer_name, repeat)
            except Exception as exc:
                log.exception("فشل أمر الطباعة: %s", exc)
            finally:
                self._jobs.task_done()


thermal_printer = PrinterManager()
