import logging
import os
import queue
import sys
import threading
import time
import ctypes
import winreg
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


def numeric_barcode(value: Any) -> str:
    """Normalize digit glyphs without changing the stored barcode value."""
    source = str(value or "000000").strip()
    return source.translate(str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789"))


def rule(draw, y, width, dashed=False):
    if dashed:
        for x in range(10, width - 10, 16):
            draw.line((x, y, min(x + 8, width - 10), y), fill="black", width=1)
    else:
        draw.line((10, y, width - 10, y), fill="black", width=2)


def asset_path(name: str) -> Path:
    root = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    bundled = root / "assets" / name
    return bundled if bundled.exists() else Path(__file__).resolve().parent / "assets" / name


class PrinterManager:
    VIRTUAL_PRINTERS = ("pdf", "onenote", "xps", "fax", "microsoft print", "send to", "webex")
    BARCODE_MARKERS = ("370", "barcode", "label")

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

    def connected_usb_ports(self) -> set[str]:
        """Read the ports of USB printers that Plug and Play says are present now."""
        ports: set[str] = set()
        cfgmgr = ctypes.WinDLL("cfgmgr32")
        root_path = r"SYSTEM\CurrentControlSet\Enum\USBPRINT"
        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, root_path) as root:
                model_index = 0
                while True:
                    try:
                        model = winreg.EnumKey(root, model_index)
                    except OSError:
                        break
                    model_index += 1
                    with winreg.OpenKey(root, model) as model_key:
                        device_index = 0
                        while True:
                            try:
                                device = winreg.EnumKey(model_key, device_index)
                            except OSError:
                                break
                            device_index += 1
                            instance_id = f"USBPRINT\\{model}\\{device}"
                            devinst = ctypes.c_ulong()
                            if cfgmgr.CM_Locate_DevNodeW(ctypes.byref(devinst), instance_id, 0) != 0:
                                continue
                            status, problem = ctypes.c_ulong(), ctypes.c_ulong()
                            if cfgmgr.CM_Get_DevNode_Status(ctypes.byref(status), ctypes.byref(problem), devinst, 0) != 0:
                                continue
                            if not status.value & 0x8 or problem.value:
                                continue
                            try:
                                with winreg.OpenKey(model_key, f"{device}\\Device Parameters") as parameters:
                                    port_name = str(winreg.QueryValueEx(parameters, "PortName")[0]).upper()
                                    if port_name:
                                        ports.add(port_name)
                            except OSError:
                                continue
        except OSError as exc:
            log.error("تعذر قراءة طابعات USB المتصلة: %s", exc)
        return ports

    def printer_kind(self, name: str) -> str:
        details = {}
        handle = None
        try:
            handle = win32print.OpenPrinter(name)
            details = win32print.GetPrinter(handle, 2)
        except Exception:
            pass
        finally:
            if handle is not None:
                win32print.ClosePrinter(handle)
        identity = f"{name} {details.get('pDriverName', '')}".lower()
        return "barcode" if any(marker in identity for marker in self.BARCODE_MARKERS) else "receipt"

    def online_printers(self) -> list[str]:
        """Return installed physical printers that Windows has not marked offline."""
        connected_ports = self.connected_usb_ports()
        if connected_ports:
            connected = []
            for name in self.physical_printers():
                handle = None
                try:
                    handle = win32print.OpenPrinter(name)
                    details = win32print.GetPrinter(handle, 2)
                    if str(details.get("pPortName") or "").upper() in connected_ports:
                        connected.append(name)
                except Exception:
                    continue
                finally:
                    if handle is not None:
                        win32print.ClosePrinter(handle)
            if connected:
                return connected
        online = []
        work_offline = getattr(win32print, "PRINTER_ATTRIBUTE_WORK_OFFLINE", 0x400)
        unavailable_status = sum(getattr(win32print, name, 0) for name in (
            "PRINTER_STATUS_ERROR", "PRINTER_STATUS_OFFLINE", "PRINTER_STATUS_NOT_AVAILABLE",
            "PRINTER_STATUS_PAPER_OUT", "PRINTER_STATUS_DOOR_OPEN", "PRINTER_STATUS_PAUSED",
        ))
        for name in self.physical_printers():
            handle = None
            try:
                handle = win32print.OpenPrinter(name)
                details = win32print.GetPrinter(handle, 2)
                attributes = int(details.get("Attributes") or 0)
                status = int(details.get("Status") or 0)
                if not attributes & work_offline and not status & unavailable_status:
                    online.append(name)
            except Exception:
                continue
            finally:
                if handle is not None:
                    win32print.ClosePrinter(handle)
        return online

    def receipt_targets(self) -> list[str]:
        printers = self.online_printers()
        printers = [name for name in printers if self.printer_kind(name) == "receipt"]
        if config.receipt_all_printers:
            return printers
        return printers[:1]

    def barcode_targets(self) -> list[str]:
        available = self.online_printers()
        selected = [name for name in config.barcode_printer_names if name in available]
        if selected:
            return selected
        return [name for name in available if self.printer_kind(name) == "barcode"][:1]

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
            "customer_phone": "01000000000",
            "cashier": "مدير النظام",
            "sales": "سيلز تجريبي",
            "items": [{"name": "منتج تجريبي", "sku": "TEST-SKU", "size": "L", "color": "أسود", "qty": 2, "price": 50}],
            "totals": [{"label": "الإجمالي النهائي", "value": 100, "final": True}, {"label": "المدفوع", "value": 40}, {"label": "المتبقي", "value": 60, "emphasis": True}],
            "payment": "نقدي",
            "barcode": "20260001",
        })

    def render_receipt(self, data: dict) -> Image.Image:
        dpi = config.dpi
        width = round(config.receipt_width_mm / 25.4 * dpi)
        items = data.get("items") or []
        totals = data.get("totals") or []
        image = Image.new("L", (width, 760 + len(items) * 72 + len(totals) * 50), "white")
        draw = ImageDraw.Draw(image)
        logo, heading, normal, small, bold = font(42, True), font(28, True), font(22), font(18), font(22, True)
        y = 10
        try:
            logo_image = Image.open(asset_path("ChatGPT Image Aug 1, 2026, 01_18_31 AM 1.png")).convert("RGBA")
            bounds = logo_image.getbbox()
            if bounds:
                logo_image = logo_image.crop(bounds)
            logo_image.thumbnail((250, 145), Image.Resampling.LANCZOS)
            logo_base = Image.new("RGBA", logo_image.size, "white")
            logo_base.alpha_composite(logo_image)
            thermal_logo = logo_base.convert("L").point(lambda value: 0 if value < 245 else 255)
            image.paste(thermal_logo, ((width - thermal_logo.width) // 2, y))
            y += thermal_logo.height + 4
        except Exception:
            draw_rtl(draw, (width // 2, y), "غيث", logo, "ma"); y += 52
        draw_rtl(draw, (width // 2, y), "للزي الإسلامي الراقي", normal, "ma"); y += 34
        draw_rtl(draw, (width // 2, y), data.get("title", "فاتورة مبيعات"), heading, "ma"); y += 42
        number = str(data.get("number") or "—")
        stamp = datetime.now()
        draw_rtl(draw, (width - 12, y), "رقم الفاتورة:", bold)
        draw.text((12, y), number, font=bold, fill="black", anchor="la"); y += 31
        draw_rtl(draw, (width - 12, y), f"التاريخ: {data.get('date') or stamp.strftime('%Y-%m-%d')}", bold)
        draw_rtl(draw, (width // 2 - 10, y), f"الوقت: {data.get('time') or stamp.strftime('%H:%M')}", bold); y += 32
        rule(draw, y, width, True); y += 20
        info_pairs = [
            (("العميل", "customer"), ("الهاتف", "customer_phone")),
            (("الكاشير", "cashier"), ("السيلز", "sales")),
            (("الدفع", "payment"), ("العنوان", "customer_address")),
        ]
        for right, left in info_pairs:
            right_value, left_value = data.get(right[1]), data.get(left[1])
            if right_value:
                draw_rtl(draw, (width - 12, y), f"{right[0]}: {str(right_value)[:24]}", bold)
            if left_value:
                draw_rtl(draw, (width // 2 - 10, y), f"{left[0]}: {str(left_value)[:24]}", bold if left[1] == "sales" else small)
            if right_value or left_value:
                y += 31
        rule(draw, y, width, True); y += 23
        # Six fixed columns, ordered right-to-left for the Arabic receipt:
        # product/barcode, size, color, quantity, unit price, line total.
        product_x = width - 12
        size_x = int(width * .64)
        color_x = int(width * .52)
        qty_x = int(width * .40)
        unit_x = int(width * .255)
        total_x = 12
        table_font = font(16, True)
        barcode_font = font(14)
        draw_rtl(draw, (product_x, y), "المنتج", table_font)
        draw_rtl(draw, (size_x, y), "المقاس", table_font, "ma")
        draw_rtl(draw, (color_x, y), "اللون", table_font, "ma")
        draw_rtl(draw, (qty_x, y), "العدد", table_font, "ma")
        draw_rtl(draw, (unit_x, y), "سعر الوحدة", table_font, "ma")
        draw_rtl(draw, (total_x, y), "الإجمالي", table_font, "la"); y += 32
        rule(draw, y, width); y += 17
        for item in items:
            name = str(item.get("name") or "صنف")
            shown = name[:15] + ("…" if len(name) > 15 else "")
            draw_rtl(draw, (product_x, y), shown, small)
            product_barcode = str(item.get("barcode") or item.get("sku") or "").strip()
            if product_barcode:
                draw.text((product_x, y + 25), product_barcode[:20], font=barcode_font, fill="black", anchor="ra")
            draw_rtl(draw, (size_x, y), str(item.get("size") or "—")[:8], table_font, "ma")
            draw_rtl(draw, (color_x, y), str(item.get("color") or "—")[:9], table_font, "ma")
            qty = float(item.get("qty") or item.get("quantity") or 1)
            draw.text((qty_x, y), f"{qty:g}", font=table_font, fill="black", anchor="ma")
            price = float(item.get("price") or item.get("unit_price") or 0)
            total = float(item.get("total") or price * qty)
            unit_text = f"{price:,.2f}".rstrip("0").rstrip(".")
            if abs(price) < 10000:
                unit_text = unit_text.replace(",", "")
            draw.text((unit_x, y), unit_text, font=table_font, fill="black", anchor="ma")
            amount_text = f"{total:,.2f}".rstrip("0").rstrip(".")
            if abs(total) < 10000:
                amount_text = amount_text.replace(",", "")
            draw.text((total_x, y), amount_text, font=table_font, fill="black", anchor="la")
            status = str(item.get("status") or "").strip()
            if status:
                draw_rtl(draw, (size_x, y + 25), status[:18], barcode_font, "ma")
            y += 54; rule(draw, y, width, True); y += 10
        rule(draw, y, width); y += 22
        for total in totals:
            final = bool(total.get("final"))
            selected = heading if final or total.get("emphasis") else normal
            draw_rtl(draw, (width - 12, y), total.get("label", "الإجمالي"), selected)
            value = float(total.get("value") or 0)
            prefix = "- " if total.get("negative") else ""
            amount_text = f"{value:,.2f}".rstrip("0").rstrip(".")
            if abs(value) < 10000:
                amount_text = amount_text.replace(",", "")
            draw.text((12, y), f"{prefix}{amount_text} {total.get('currency', 'ج.م')}", font=heading if final else bold, fill="black", anchor="la")
            y += 46
        rule(draw, y, width, True); y += 23
        if data.get("note"):
            draw_rtl(draw, (width // 2, y), str(data["note"])[:55], small, "ma"); y += 32
        draw_rtl(draw, (width // 2, y), "شكرًا لزيارتكم", heading, "ma"); y += 38
        draw_rtl(draw, (width // 2, y), "احتفظ بالفاتورة للاستبدال أو الاسترجاع", small, "ma"); y += 34
        barcode_value = str(data.get("barcode") or number)
        try:
            code = Code128(barcode_value, writer=ImageWriter()).render({"module_height": 14, "module_width": .36, "quiet_zone": 3, "font_size": 0, "text_distance": 0, "dpi": dpi}).convert("L")
            max_barcode_width = width - 64
            if code.width > max_barcode_width:
                scaled_height = round(code.height * max_barcode_width / code.width)
                code = code.resize((max_barcode_width, scaled_height), Image.Resampling.NEAREST)
            image.paste(code, ((width - code.width) // 2, y))
            y += code.height + 8
        except Exception:
            pass
        draw.text((width // 2, y), barcode_value, font=small, fill="black", anchor="ma"); y += 28
        draw_rtl(draw, (width // 2, y), "امسح الباركود للبحث عن الفاتورة", small, "ma")
        return image.crop((0, 0, width, y + 28))

    def render_barcode(self, data: dict) -> Image.Image:
        dpi = config.dpi
        width = round(config.barcode_width_mm / 25.4 * dpi)
        height = round(config.barcode_height_mm / 25.4 * dpi)
        image = Image.new("L", (width, height), "white")
        draw, small, bold = ImageDraw.Draw(image), font(14), font(18, True)
        product_area_width = width
        try:
            logo_image = Image.open(asset_path("ChatGPT Image Aug 1, 2026, 01_18_31 AM 1.png")).convert("RGBA")
            bounds = logo_image.getbbox()
            if bounds:
                logo_image = logo_image.crop(bounds)
            logo_image.thumbnail((54, 40), Image.Resampling.LANCZOS)
            logo_base = Image.new("RGBA", logo_image.size, "white")
            logo_base.alpha_composite(logo_image)
            barcode_logo = logo_base.convert("L").point(lambda value: 0 if value < 245 else 255)
            image.paste(barcode_logo, (width - barcode_logo.width - 4, 1))
            product_area_width = width - barcode_logo.width - 8
        except Exception:
            draw_rtl(draw, (width - 5, 3), "غيث", bold, "ra")
            product_area_width = width - 58
        draw_rtl(draw, (product_area_width // 2, 3), str(data.get("name") or "منتج")[:24], bold, "ma")
        details = " | ".join(part for part in (
            f"المقاس: {data.get('size')}" if data.get("size") else "",
            f"اللون: {data.get('color')}" if data.get("color") else "",
        ) if part)
        if details:
            draw_rtl(draw, (product_area_width // 2, 23), details[:30], small, "ma")

        # The scanner must receive the real product barcode, not the internal SKU.
        # Two-dot modules at 203 dpi and a proper quiet zone make Code 128 much
        # more reliable on small thermal labels.
        barcode_value = numeric_barcode(data.get("barcode") or data.get("sku"))
        code = Code128(barcode_value, writer=ImageWriter()).render({
            "module_height": 9,
            "module_width": .254,
            "quiet_zone": 2.5,
            "font_size": 0,
            "text_distance": 0,
            "dpi": dpi,
        }).convert("L")
        code.thumbnail((width - 20, max(48, height - 105)), Image.Resampling.NEAREST)
        code_y = 43
        image.paste(code, ((width - code.width) // 2, code_y))
        sku_y = min(code_y + code.height + 4, height - 46)
        draw.text((width // 2, sku_y), barcode_value, font=small, fill="black", anchor="ma")
        if data.get("price") not in (None, ""):
            draw_rtl(draw, (width // 2, min(sku_y + 25, height - 16)), f"{data['price']} ج.م", bold, "md")
        return image

    def _print_barcode_raw(self, image: Image.Image, printer_name: str, document_name: str, barcode_value: str, copies: int = 1):
        """Print a native TSPL barcode with no raster polarity ambiguity."""
        # Only the compact Arabic product header is rasterized. The barcode is
        # still generated by the printer itself for maximum scan reliability.
        info = image.crop((0, 0, image.width, 41)).point(
            lambda value: 0 if value < 160 else 255, mode="1"
        )
        width_bytes = (info.width + 7) // 8
        # XP-370B's TSPL bitmap polarity is inverted compared with Pillow:
        # a set bit is paper white and a cleared bit is printed black.
        bitmap = bytearray([0xFF]) * (width_bytes * info.height)
        pixels = info.load()
        for y in range(info.height):
            row = y * width_bytes
            for x in range(info.width):
                if pixels[x, y] == 0:
                    bitmap[row + x // 8] &= ~(0x80 >> (x % 8))

        prefix = (
            f"SIZE {config.barcode_width_mm} mm,{config.barcode_height_mm - 0.5:g} mm\r\n"
            "GAP 3 mm,0 mm\r\n"
            "OFFSET 0 mm\r\n"
            "DIRECTION 1\r\n"
            "REFERENCE 0,0\r\n"
            "DENSITY 10\r\n"
            "SPEED 1.5\r\n"
            "CLS\r\n"
            f"BITMAP 0,14,{width_bytes},{info.height},0,"
        ).encode("ascii")
        label_width = round(config.barcode_width_mm / 25.4 * config.dpi)
        value_x = max(8, (label_width - len(barcode_value) * 12) // 2)
        # Encode only the numeric portion so HID scanners are independent of
        # keyboard language. Keep the complete stored value printed below.
        encoded_value = "".join(character for character in barcode_value if character.isdigit()) or barcode_value
        barcode_type = "128"
        module_count = len(Code128(encoded_value).build()[0])
        barcode_x = max(8, (label_width - module_count * 2) // 2)
        suffix = (
            f'\r\nBARCODE {barcode_x},58,"{barcode_type}",78,0,0,2,4,"{encoded_value}"\r\n'
            f'TEXT {value_x},143,"2",0,1,1,"{barcode_value}"\r\n'
            f"PRINT 1,{max(1, copies)}\r\n"
        ).encode("ascii")
        command = prefix + bytes(bitmap) + suffix

        handle = win32print.OpenPrinter(printer_name)
        try:
            job = win32print.StartDocPrinter(handle, 1, (document_name, None, "RAW"))
            try:
                win32print.StartPagePrinter(handle)
                win32print.WritePrinter(handle, command)
                win32print.EndPagePrinter(handle)
            finally:
                win32print.EndDocPrinter(handle)
            return job
        finally:
            win32print.ClosePrinter(handle)

    def _barcode_devmode(self, printer_name: str):
        """Return a private DEVMODE with the exact configured label size."""
        handle = win32print.OpenPrinter(printer_name)
        try:
            devmode = win32print.GetPrinter(handle, 2)["pDevMode"]
            devmode.PaperSize = getattr(win32con, "DMPAPER_USER", 256)
            devmode.PaperWidth = round(config.barcode_width_mm * 10)
            devmode.PaperLength = round(config.barcode_height_mm * 10)
            devmode.Fields |= (
                win32con.DM_PAPERSIZE | win32con.DM_PAPERWIDTH | win32con.DM_PAPERLENGTH
            )
            return devmode
        finally:
            win32print.ClosePrinter(handle)

    def _print_image(self, image: Image.Image, printer_name: str, document_name: str, kind: str):
        dc = win32ui.CreateDC()
        try:
            if kind == "barcode":
                try:
                    dc.CreateDC("WINSPOOL", printer_name, None, self._barcode_devmode(printer_name))
                except Exception:
                    # Some older drivers reject a private DEVMODE; retain a safe
                    # fallback while still drawing one image per physical page.
                    dc.CreatePrinterDC(printer_name)
            else:
                dc.CreatePrinterDC(printer_name)
            printable_width = dc.GetDeviceCaps(win32con.HORZRES)
            printable_height = dc.GetDeviceCaps(win32con.VERTRES)
            if kind == "barcode":
                # Fit both axes. Width-only scaling made the image taller than
                # the label and caused every following label to drift.
                scale = min(printable_width / image.width, printable_height / image.height)
                target_width = max(1, round(image.width * scale))
                target_height = max(1, round(image.height * scale))
                left = (printable_width - target_width) // 2
                top = (printable_height - target_height) // 2
                target = (left, top, left + target_width, top + target_height)
            else:
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
                attempts = 8 if kind == "receipt" else 1
                printed = False
                for attempt in range(attempts):
                    targets = self.receipt_targets() if kind == "receipt" else self.barcode_targets()
                    for printer_name in targets:
                        try:
                            repeat = 1 if kind == "receipt" else copies
                            document_name = f"Ghaith {payload.get('number') or payload.get('barcode') or payload.get('sku') or kind}"
                            if kind == "barcode":
                                barcode_value = numeric_barcode(payload.get("barcode") or payload.get("sku"))
                                try:
                                    self._print_barcode_raw(image, printer_name, document_name, barcode_value, repeat)
                                except Exception:
                                    for copy_number in range(repeat):
                                        self._print_image(image, printer_name, document_name, kind)
                            else:
                                for copy_number in range(repeat):
                                    self._print_image(image, printer_name, document_name, kind)
                            printed = True
                            log.info("تمت طباعة %s على %s بعدد %s", kind, printer_name, repeat)
                        except Exception as exc:
                            log.exception("فشلت الطباعة على %s: %s", printer_name, exc)
                    if printed or attempt == attempts - 1:
                        break
                    # USB thermal printers can take a few seconds to reappear
                    # after swapping the barcode and receipt printer cables.
                    time.sleep(2)
                if not printed:
                    if config.preview_when_no_printer:
                        self._save_preview(image, kind, copies)
                    else:
                        log.error("لا توجد طابعة فعلية جاهزة")
            except Exception as exc:
                log.exception("فشل أمر الطباعة: %s", exc)
            finally:
                self._jobs.task_done()


thermal_printer = PrinterManager()
