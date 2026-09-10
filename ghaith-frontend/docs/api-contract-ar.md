# عقد الـ API المقترح لنظام غيث POS

> الإصدار: `v1` — العملة الوحيدة في النظام: `EGP` — التوقيت المخزن: UTC بصيغة ISO-8601.
>
> هذا المستند يجمع ما يستدعيه الفرونت حاليًا وما تحتاجه الشاشات التي ما زالت Mock. أي اعتماد فاتورة أو حركة مالية يجب أن يتم داخل Database Transaction واحدة.

## 1. قواعد عامة

Base URL:

```text
/api/v1
```

Headers:

```http
Authorization: Bearer <access_token>
Content-Type: application/json
Idempotency-Key: <uuid>  # مطلوب في العمليات المالية وحركات المخزون
```

شكل القائمة الموحد:

```json
{
  "items": [],
  "page": 1,
  "page_size": 20,
  "total": 125,
  "total_pages": 7
}
```

شكل الخطأ الموحد:

```json
{
  "error": {
    "code": "validation_error",
    "message": "راجع البيانات المدخلة.",
    "fields": {
      "items.0.quantity": "الكمية غير متاحة."
    },
    "request_id": "req_01J..."
  }
}
```

أكواد مهمة: `400` بيانات غير صحيحة، `401` غير مسجل، `403` غير مصرح، `404` غير موجود، `409` تعارض نسخة/تكرار، `422` Validation، `429` طلبات كثيرة.

كل كيان قابل للتعديل يرجع `version` ويستقبلها في التعديل لمنع الكتابة فوق تعديل أحدث.

## 2. تسجيل الدخول والمستخدم الحالي

### `POST /auth/login`

```json
{
  "username": "admin",
  "password": "secret"
}
```

```json
{
  "access_token": "jwt",
  "refresh_token": "jwt",
  "token_type": "bearer",
  "expires_in": 3600
}
```

### `POST /auth/refresh`

```json
{ "refresh_token": "jwt" }
```

يرجع نفس شكل tokens السابق.

### `POST /auth/logout`

```json
{ "refresh_token": "jwt" }
```

الرد: `204 No Content`.

### `GET /users/me`

```json
{
  "id": "usr_1",
  "username": "admin",
  "name": "مدير النظام",
  "phone": "01000000000",
  "role": "admin",
  "permissions": ["products.read", "products.write", "sales.create"],
  "is_active": true
}
```

## 3. المستخدمون والصلاحيات

| Method | Endpoint | الاستخدام |
|---|---|---|
| GET | `/admin/users?page=&page_size=&search=&role=&is_active=` | القائمة |
| POST | `/admin/users` | إضافة مستخدم |
| PATCH | `/admin/users/{id}` | تعديل/تفعيل/تعطيل |
| DELETE | `/admin/users/{id}` | أرشفة المستخدم |
| GET | `/admin/roles` | الأدوار والصلاحيات |

```json
{
  "username": "cashier01",
  "name": "أحمد محمد",
  "phone": "01000000000",
  "password": "StrongPassword",
  "role": "cashier",
  "is_active": true
}
```

```json
{
  "id": "usr_2",
  "username": "cashier01",
  "name": "أحمد محمد",
  "phone": "01000000000",
  "role": "cashier",
  "role_id": "role_cashier",
  "is_active": true,
  "created_at": "2026-09-06T10:00:00Z",
  "version": 1
}
```

## 4. التصنيفات

| Method | Endpoint |
|---|---|
| GET | `/categories?status=active` للقوائم العامة |
| GET | `/admin/categories?page=&page_size=&search=&status=` |
| GET | `/admin/categories/summary` |
| POST | `/admin/categories` |
| PATCH | `/admin/categories/{id}` |
| DELETE | `/admin/categories/{id}` |

```json
{
  "name": "جلابيب",
  "description": "جلابيب رجالي",
  "status": "active"
}
```

```json
{
  "id": "cat_1",
  "name": "جلابيب",
  "description": "جلابيب رجالي",
  "status": "active",
  "product_count": 18,
  "created_at": "2026-09-06T10:00:00Z",
  "version": 1
}
```

Summary:

```json
{ "total_category_count": 12, "active_category_count": 10, "inactive_category_count": 2 }
```

حذف تصنيف مرتبط بمنتجات يرجع `409 category_has_products` ولا يعتمد على منع الفرونت فقط.

## 5. المنتجات والـ Variants

| Method | Endpoint |
|---|---|
| GET | `/admin/products?page=&page_size=&search=&category_id=&stock_status=&status=` |
| GET | `/admin/products/summary` |
| GET | `/products/{id}` |
| POST | `/admin/products` |
| PATCH | `/admin/products/{id}` |
| DELETE | `/admin/products/{id}` |
| GET | `/products/search?q=&barcode=&category_id=&in_stock=true` للكاشير والفواتير |

إنشاء منتج بمقاس واحد أو عدة مقاسات:

```json
{
  "name_ar": "تيشيرت قطن",
  "name_internal": "Cotton T-Shirt",
  "category_id": "cat_1",
  "purchase_price": 200,
  "sale_price": 350,
  "low_stock_threshold": 5,
  "commission_rate": 2.5,
  "barcode": "62210001",
  "image_url": null,
  "status": "active",
  "variants": [
    { "size": "M", "color": "أسود", "quantity": 10, "sku": "TS-BLK-M", "barcode": "622100011", "is_default": false },
    { "size": "L", "color": "أسود", "quantity": 8, "sku": "TS-BLK-L", "barcode": "622100012", "is_default": false }
  ]
}
```

لمنتج بدون تعدد مقاسات ترسل نسخة واحدة `is_default: true` ويجوز أن يكون المقاس واللون `افتراضي`.

```json
{
  "id": "prd_1",
  "name_ar": "تيشيرت قطن",
  "name_internal": "Cotton T-Shirt",
  "category_id": "cat_1",
  "category": { "id": "cat_1", "name": "تيشيرتات" },
  "purchase_price": 200,
  "sale_price": 350,
  "commission_rate": 2.5,
  "low_stock_threshold": 5,
  "stock_quantity": 18,
  "stock_status": "available",
  "status": "active",
  "version": 3,
  "product_variants": [
    { "id": "var_1", "sku": "TS-BLK-M", "barcode": "622100011", "size": "M", "color": "أسود", "stock_qty": 10, "version": 2 }
  ]
}
```

قواعد قاعدة البيانات: `sku` و`barcode` فريدان، ولا يتكرر `(product_id, size, color)`.

## 6. الموردون

| Method | Endpoint |
|---|---|
| GET | `/admin/suppliers?page=&page_size=&search=&status=` |
| GET | `/admin/suppliers/summary` |
| GET | `/admin/suppliers/{id}` |
| POST | `/admin/suppliers` |
| PATCH | `/admin/suppliers/{id}` |
| DELETE | `/admin/suppliers/{id}` |

```json
{
  "name": "شركة الأمل",
  "phone": "01012345678",
  "address": "القاهرة",
  "notes": "السداد خلال 30 يومًا",
  "status": "active"
}
```

```json
{
  "id": "sup_1",
  "name": "شركة الأمل",
  "phone": "01012345678",
  "address": "القاهرة",
  "notes": "السداد خلال 30 يومًا",
  "status": "active",
  "total_purchases": 50000,
  "total_paid": 30000,
  "balance_due": 20000,
  "created_at": "2026-09-06T10:00:00Z",
  "version": 1
}
```

```json
{ "total_suppliers": 30, "active_suppliers": 27, "total_payables": 125000 }
```

الربط بين المورد والمنتج يتم عبر بنود فواتير الشراء. لو مطلوب مورد افتراضي للمنتج يضاف جدول `product_suppliers` وAPI `/admin/products/{id}/suppliers`.

## 7. فواتير المشتريات ومدفوعات الموردين

| Method | Endpoint |
|---|---|
| GET | `/admin/suppliers/{supplier_id}/purchase-invoices?page=&status=` |
| GET | `/admin/purchase-invoices/{id}` |
| POST | `/admin/purchase-invoices/drafts` |
| PATCH | `/admin/purchase-invoices/{id}/draft` |
| POST | `/admin/purchase-invoices/{id}/approve` |
| POST | `/admin/purchase-invoices/{id}/payments` |
| GET | `/admin/purchase-invoices/{id}/payments` |
| POST | `/admin/purchase-invoices/{id}/void` |
| POST | `/admin/supplier-reminders/run` |

إنشاء/تحديث المسودة:

```json
{
  "supplier_id": "sup_1",
  "invoice_date": "2026-09-06",
  "due_date": "2026-10-06",
  "notes": "دفعة سبتمبر",
  "discount_amount": 200,
  "shipping_amount": 100,
  "payment_state": "partial",
  "payment_method": "cash",
  "paid_amount": 8000,
  "payment_reference": null,
  "items": [
    { "variant_id": "var_1", "quantity": 20, "unit_cost": 200, "discount_amount": 50, "expected_version": 2 }
  ]
}
```

الاعتماد:

```json
{ "expected_version": 1 }
```

```json
{
  "id": "pinv_1",
  "invoice_number": "PUR-2026-000123",
  "supplier_id": "sup_1",
  "status": "approved",
  "subtotal": 4000,
  "line_discount_amount": 50,
  "discount_amount": 200,
  "shipping_amount": 100,
  "total_amount": 3850,
  "paid_amount": 1000,
  "remaining_amount": 2850,
  "currency": "EGP",
  "items": [{ "id": "pitem_1", "variant_id": "var_1", "product_name": "تيشيرت", "size": "M", "color": "أسود", "quantity": 20, "unit_cost": 200, "line_total": 3950 }],
  "version": 2
}
```

اعتماد الفاتورة ذريًا: يعيد الخادم الحساب، يزيد مخزون كل Variant، يسجل `inventory_movement`، يحدث حساب المورد، ويسجل الدفعة الأولى. الـdraft لا يؤثر على المخزون.

دفعة مورد لاحقة:

```json
{ "amount": 1000, "method": "bank", "reference": "TRX-123", "paid_at": "2026-09-06T12:00:00Z", "expected_version": 2 }
```

## 8. المخزون والحركات

| Method | Endpoint |
|---|---|
| GET | `/admin/inventory?page=&page_size=&search=&category_id=&stock_status=` |
| GET | `/admin/inventory/summary` |
| GET | `/admin/inventory/movements?page=&variant_id=&type=&from=&to=` |
| POST | `/admin/products/{product_id}/stock-adjustments` |
| POST | `/admin/inventory/stocktake` |

```json
{
  "variant_id": "var_1",
  "qty_delta": -2,
  "reason": "تسوية جرد",
  "expected_version": 2
}
```

```json
{
  "movement": { "id": "mov_1", "variant_id": "var_1", "type": "adjustment", "qty_delta": -2, "quantity_before": 10, "quantity_after": 8, "unit_cost": 200, "source_type": "manual_adjustment", "source_id": null, "created_at": "2026-09-06T12:00:00Z" },
  "variant": { "id": "var_1", "stock_qty": 8, "version": 3 }
}
```

أنواع الحركة: `opening`, `purchase`, `sale`, `sale_return`, `purchase_return`, `exchange_in`, `exchange_out`, `adjustment`, `stocktake`.

Summary:

```json
{ "total_units": 1250, "inventory_cost_value": 320000, "low_stock_count": 8, "out_of_stock_count": 3 }
```

## 9. نقطة البيع وفواتير المبيعات

| Method | Endpoint |
|---|---|
| GET | `/pos/catalog?search=&barcode=&category_id=&page=` |
| GET | `/pos/sales-users?status=active` |
| POST | `/pos/sales/quote` لحساب الإجماليات قبل الحفظ |
| POST | `/pos/sales` إنشاء واعتماد البيع |
| GET | `/sales-invoices?page=&invoice_number=&customer=&phone=&cashier_id=&payment_method=&status=&date_from=&date_to=` |
| GET | `/sales-invoices/{id}` |

Catalog item:

```json
{
  "id": "var_1",
  "product_id": "prd_1",
  "name": "تيشيرت قطن",
  "category": { "id": "cat_1", "name": "تيشيرتات" },
  "sku": "TS-BLK-M",
  "barcode": "622100011",
  "size": "M",
  "color": "أسود",
  "sale_price": 350,
  "stock_qty": 10,
  "version": 2
}
```

إنشاء البيع:

```json
{
  "customer": { "type": "walk_in", "name": "عميل نقدي", "phone": null },
  "sales_user_id": "usr_sales_1",
  "discount": { "type": "amount", "value": 50, "code": null },
  "payment": { "method": "cash", "paid_amount": 700, "cash_received": 1000 },
  "items": [{ "variant_id": "var_1", "quantity": 2, "expected_version": 2 }]
}
```

```json
{
  "id": "sinv_1",
  "invoice_number": "INV-2026-000321",
  "status": "completed",
  "subtotal": 700,
  "discount_amount": 50,
  "tax_amount": 0,
  "total_amount": 650,
  "paid_amount": 650,
  "remaining_amount": 0,
  "change_amount": 350,
  "currency": "EGP",
  "items": [{ "variant_id": "var_1", "name": "تيشيرت قطن", "sku": "TS-BLK-M", "quantity": 2, "unit_price": 350, "line_total": 700 }],
  "created_at": "2026-09-06T12:00:00Z"
}
```

الخادم يتحقق من السعر والخصم والمخزون وينقص المخزون ذريًا. البيع الآجل ينشئ دين عميل.

## 10. المرتجعات والاستبدال

| Method | Endpoint |
|---|---|
| POST | `/sales-invoices/{id}/returns/quote` |
| POST | `/sales-invoices/{id}/returns` |
| POST | `/sales-invoices/{id}/exchanges/quote` |
| POST | `/sales-invoices/{id}/exchanges` |
| GET | `/sales-invoices/{id}/operations` |

```json
{
  "reason": "مقاس غير مناسب",
  "refund_method": "cash",
  "return_items": [{ "invoice_item_id": "sitem_1", "quantity": 1 }],
  "replacement_items": [{ "variant_id": "var_2", "quantity": 1, "expected_version": 4 }],
  "difference_payment": { "method": "cash", "amount": 50 }
}
```

```json
{
  "id": "exc_1",
  "number": "EXC-2026-00001",
  "return_total": 350,
  "replacement_total": 400,
  "difference_amount": 50,
  "difference_direction": "customer_pays",
  "status": "completed"
}
```

لا يسمح بإرجاع كمية أكبر من المباعة ناقص المرتجع السابق. المرتجع يزيد المخزون، والبديل ينقصه، وكل ذلك في Transaction واحدة.

## 11. ديون العملاء والتحصيل

| Method | Endpoint |
|---|---|
| GET | `/debts?page=&search=&cashier_id=&date_from=&date_to=&status=open` |
| GET | `/debts/{id}` |
| POST | `/debts/{id}/payments` |
| POST | `/debts/{id}/reminders` |

```json
{ "amount": 500, "method": "instapay", "reference": "IPN-123", "paid_at": "2026-09-06T12:00:00Z", "expected_version": 2 }
```

```json
{ "id": "debt_1", "invoice_id": "sinv_1", "customer_name": "أحمد", "total_amount": 2500, "paid_amount": 1500, "remaining_amount": 1000, "status": "partial", "version": 3 }
```

## 12. المصروفات

| Method | Endpoint |
|---|---|
| GET | `/expenses?page=&search=&type=&shift_id=&date_from=&date_to=` |
| GET | `/expenses/summary?shift_id=` |
| POST | `/expenses` |
| PATCH | `/expenses/{id}` |
| DELETE | `/expenses/{id}` |

```json
{ "type": "صيانة", "description": "إصلاح التكييف", "amount": 250, "payment_method": "cash", "occurred_at": "2026-09-06T12:00:00Z" }
```

```json
{ "id": "EXP-000107", "type": "صيانة", "description": "إصلاح التكييف", "amount": 250, "cashier": { "id": "usr_2", "name": "أحمد" }, "shift_id": "shift_1", "status": "recorded", "created_at": "2026-09-06T12:00:00Z", "version": 1 }
```

## 13. الورديات

| Method | Endpoint |
|---|---|
| GET | `/shifts/current` |
| POST | `/shifts/open` |
| GET | `/shifts/{id}/summary` |
| POST | `/shifts/{id}/close` |

فتح وردية:

```json
{ "opening_cash": 1000, "notes": null }
```

إغلاق وردية:

```json
{
  "counted_cash": 4850,
  "payment_counts": [{ "method": "cash", "counted_amount": 4850 }, { "method": "card", "counted_amount": 3000 }],
  "notes": "تمت المراجعة",
  "expected_version": 4
}
```

```json
{
  "id": "shift_1",
  "status": "closed",
  "opening_cash": 1000,
  "cash_sales": 4000,
  "cash_debt_collections": 500,
  "cash_expenses": 650,
  "expected_cash": 4850,
  "counted_cash": 4850,
  "difference": 0,
  "total_sales": 7000,
  "invoice_count": 18,
  "opened_at": "2026-09-06T08:00:00Z",
  "closed_at": "2026-09-06T16:00:00Z"
}
```

## 14. فئات العملاء والخصومات

| Method | Endpoint |
|---|---|
| GET | `/customer-types?status=active` للكاشير |
| GET | `/admin/customer-types?page=&status=` |
| POST | `/admin/customer-types` |
| PATCH | `/admin/customer-types/{id}` |
| DELETE | `/admin/customer-types/{id}` |
| POST | `/discounts/validate` للتحقق من كود خصم اختياري |

```json
{ "name": "صاحب محل", "discount_type": "percentage", "discount_value": 15, "status": "active" }
```

```json
{ "id": "ctype_1", "name": "صاحب محل", "discount_type": "percentage", "discount_value": 15, "status": "active", "version": 1 }
```

الفرونت يعرض النسبة، لكن الخادم هو الذي يطبقها ويتحقق من صلاحية المستخدم والحد الأقصى للخصم عند إنشاء البيع.

## 15. العملاء

| Method | Endpoint |
|---|---|
| GET | `/customers?search=&phone=&page=` |
| GET | `/customers/{id}` |
| POST | `/customers` |
| PATCH | `/customers/{id}` |

```json
{ "name": "أحمد محمد", "phone": "01000000000", "address": "القاهرة", "customer_type_id": "ctype_1" }
```

```json
{ "id": "cus_1", "name": "أحمد محمد", "phone": "01000000000", "address": "القاهرة", "customer_type": { "id": "ctype_1", "name": "صاحب محل", "discount_value": 15 }, "balance_due": 1000, "version": 1 }
```

## 16. ملف الكاشير والأداء

| Method | Endpoint |
|---|---|
| GET | `/cashier/profile/summary?date=` |
| GET | `/cashier/profile/transactions?page=&date_from=&date_to=` |

```json
{
  "user": { "id": "usr_2", "name": "أحمد محمود" },
  "sales_total": 45280,
  "invoice_count": 124,
  "average_basket": 365.16,
  "commission_total": 1358.4,
  "comparison_percent": 12.5,
  "target": { "amount": 50000, "achieved": 45280, "percentage": 90.56 }
}
```

## 17. لوحة الإدارة والتقارير

| Method | Endpoint |
|---|---|
| GET | `/admin/dashboard?from=&to=` |
| GET | `/admin/reports/sales?from=&to=&group_by=day` |
| GET | `/admin/reports/inventory?category_id=&stock_status=` |
| GET | `/admin/reports/profit?from=&to=` |
| GET | `/admin/reports/suppliers?from=&to=` |
| GET | `/admin/reports/expenses?from=&to=&type=` |
| GET | `/admin/reports/sales-users?from=&to=` |
| GET | نفس المسارات مع `format=xlsx|pdf` للتصدير من الخادم عند الحاجة |

```json
{
  "period": { "from": "2026-09-01", "to": "2026-09-06" },
  "kpis": { "sales_total": 84520, "net_sales": 79150, "invoice_count": 342, "returns_total": 2170, "gross_profit": 28500, "expenses_total": 3200 },
  "sales_series": [{ "date": "2026-09-01", "amount": 12000 }],
  "top_products": [{ "product_id": "prd_1", "name": "تيشيرت", "quantity": 35, "sales_amount": 12250 }],
  "payment_distribution": [{ "method": "cash", "amount": 50000, "percentage": 59.16 }]
}
```

## 18. الزكاة

| Method | Endpoint |
|---|---|
| GET | `/admin/zakat/settings` |
| PATCH | `/admin/zakat/settings` |
| POST | `/admin/zakat/calculate` |
| GET | `/admin/zakat/reports/{id}` |

```json
{
  "valuation_date": "2026-09-06",
  "rate": 0.025,
  "valuation_method": "cost",
  "include_inventory": true,
  "include_cash": true,
  "include_receivables": true,
  "deduct_payables": true,
  "nisab_amount": 0
}
```

```json
{
  "id": "zakat_2026",
  "valuation_date": "2026-09-06",
  "inventory_value": 1245000,
  "cash_value": 100000,
  "receivables_value": 50000,
  "deductible_payables": 200000,
  "net_zakatable_assets": 1195000,
  "rate": 0.025,
  "zakat_due": 29875,
  "currency": "EGP",
  "items": [{ "variant_id": "var_1", "product_name": "تيشيرت", "quantity": 150, "unit_value": 800, "total_value": 120000 }]
}
```

سياسة الحول والنصاب وطريقة تقييم المخزون يجب اعتمادها من المحاسب/المختص الشرعي، ولا تثبت داخل الفرونت.

## 19. الإشعارات

| Method | Endpoint |
|---|---|
| GET | `/notifications?page=&read=` |
| PATCH | `/notifications/{id}` |
| POST | `/notifications/read-all` |

```json
{ "id": "not_1", "type": "low_stock", "priority": "warning", "title": "مخزون منخفض", "message": "متبقي 5 قطع", "entity_type": "product", "entity_id": "prd_1", "read": false, "created_at": "2026-09-06T12:00:00Z" }
```

## 20. خدمة الطباعة المحلية

هذه ليست API الباك إند السحابي. الفرونت يستخدم Print Agent محليًا:

```text
GET  /health
POST /print/receipt
POST /print/report
POST /print/barcode
```

```json
{ "printer": "thermal-80mm", "copies": 1, "document": { "title": "فاتورة مبيعات", "number": "INV-1", "items": [], "totals": [] } }
```

## 21. ترتيب التنفيذ المقترح

1. Auth، users، roles.
2. Categories، products، variants والبحث بالباركود.
3. Inventory movements والتسويات.
4. Suppliers ثم purchase drafts/approval/payments.
5. POS sales واعتماد خصم المخزون.
6. Sales invoices، returns، exchanges، debts.
7. Expenses وshifts.
8. Customer types/discounts وملف أداء الكاشير.
9. Dashboard/reports/notifications.
10. Zakat بعد اعتماد السياسة المحاسبية والشرعية.

## 22. اختبارات قبول أساسية للباك إند

- اعتماد نفس الفاتورة مرتين بنفس `Idempotency-Key` لا يكرر المخزون أو الحسابات.
- تعارض `expected_version` يرجع `409` ولا ينفذ جزءًا من العملية.
- فاتورة شراء بمقاسين تزيد كل Variant بكمية مستقلة.
- فاتورة بيع لا تسمح بمخزون سالب تحت التزامن.
- المرتجع لا يتجاوز صافي الكمية القابلة للإرجاع.
- مجموع قيود المخزون يطابق `stock_qty` لكل Variant.
- رصيد المورد يساوي المعتمد ناقص المدفوع والمرتجع.
- دين العميل يساوي إجمالي الآجل ناقص التحصيلات والمرتجعات.
- كل المبالغ تعاد من الخادم بدقة خانتين ولا يثق الخادم في إجماليات الفرونت.
