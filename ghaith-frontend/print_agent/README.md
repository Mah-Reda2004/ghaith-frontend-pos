# Ghaith Print Agent

وكيل طباعة محلي لنظام غيث يعمل على `127.0.0.1:17891` دون نافذة طباعة المتصفح.

- الفاتورة الحرارية 80mm تُطبع مرة على كل الطابعات الفعلية المتصلة بالجهاز.
- الباركود 37×23mm يُطبع على الطابعة المختارة بعدد كمية المنتج (`copies`).
- عند عدم وجود طابعة تُحفظ معاينة PNG داخل `%LOCALAPPDATA%\GhaithPrintAgent\previews` في نسخة EXE، أو داخل `print_agent\previews` أثناء التطوير.
- صفحة الإعدادات: `http://127.0.0.1:17891`.

## البناء والتثبيت

1. شغّل `build-exe.ps1`.
2. شغّل `install-startup.ps1` لتثبيت النسخة وإنشاء اختصار مخفي داخل Startup وتشغيلها مع بدء Windows.

## API

- `GET /health`
- `GET /api/printers`
- `POST /api/print/receipt`
- `POST /api/print/barcode`

طلبات الطباعة تستخدم `X-Ghaith-Print-Key: ghaith-local-print-v1`.
