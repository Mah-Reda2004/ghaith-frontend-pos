import json
import os
import sys
from pathlib import Path
from threading import RLock


def _base_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(os.environ.get("LOCALAPPDATA", Path(sys.executable).parent)) / "GhaithPrintAgent"
    return Path(__file__).resolve().parent


BASE_DIR = _base_dir()
BASE_DIR.mkdir(parents=True, exist_ok=True)
SETTINGS_PATH = BASE_DIR / "settings.json"
PREVIEWS_DIR = BASE_DIR / "previews"
PREVIEWS_DIR.mkdir(parents=True, exist_ok=True)

DEFAULTS = {
    "local_port": 17891,
    "api_key": "ghaith-local-print-v1",
    "receipt_all_printers": True,
    "barcode_printer_names": [],
    "receipt_width_mm": 80,
    # 80 mm mechanisms normally expose a 72 mm / 576-dot printable area.
    # Keeping this explicit prevents raster rows from wrapping on the printer.
    "receipt_print_width_dots": 576,
    "barcode_width_mm": 37,
    "barcode_height_mm": 23,
    "dpi": 203,
    "preview_when_no_printer": True,
}


class PrintAgentConfig:
    def __init__(self):
        self._lock = RLock()
        self._data = {}
        self.load()

    def load(self):
        with self._lock:
            try:
                value = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
                self._data = value if isinstance(value, dict) else {}
            except (OSError, json.JSONDecodeError):
                self._data = {}

    def save(self) -> bool:
        with self._lock:
            temp_path = SETTINGS_PATH.with_suffix(".json.tmp")
            try:
                temp_path.write_text(json.dumps(self.all(), ensure_ascii=False, indent=2), encoding="utf-8")
                os.replace(temp_path, SETTINGS_PATH)
                return True
            except OSError:
                temp_path.unlink(missing_ok=True)
                return False

    def get(self, key, fallback=None):
        return self._data.get(key, DEFAULTS.get(key, fallback))

    def set(self, key, value):
        with self._lock:
            self._data[key] = value

    def all(self):
        return {**DEFAULTS, **self._data}

    @property
    def local_port(self): return int(self.get("local_port"))
    @property
    def api_key(self): return str(self.get("api_key"))
    @property
    def receipt_all_printers(self): return bool(self.get("receipt_all_printers"))
    @property
    def barcode_printer_names(self):
        names = self.get("barcode_printer_names", [])
        return [str(name) for name in names] if isinstance(names, list) else []
    @property
    def receipt_width_mm(self): return int(self.get("receipt_width_mm"))
    @property
    def receipt_print_width_dots(self): return int(self.get("receipt_print_width_dots"))
    @property
    def barcode_width_mm(self): return int(self.get("barcode_width_mm"))
    @property
    def barcode_height_mm(self): return int(self.get("barcode_height_mm"))
    @property
    def dpi(self): return int(self.get("dpi"))
    @property
    def preview_when_no_printer(self): return bool(self.get("preview_when_no_printer"))


config = PrintAgentConfig()
