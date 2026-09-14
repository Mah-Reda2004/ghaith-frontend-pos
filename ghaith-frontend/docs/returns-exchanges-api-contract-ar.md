# عقد API الاسترجاع والاستبدال

هذا المستند يوضح جميع الـAPIs والحقول المطلوبة لتشغيل مسار الاسترجاع والاستبدال كاملًا في واجهة الكاشير.

## قواعد عامة

- جميع المبالغ بعملة `EGP`.
- جميع عمليات التنفيذ المالية تستقبل `Idempotency-Key` بقيمة UUID في الـheaders.
- الحسابات النهائية، فحص المخزون، وتحديث الحركات تتم في الباك إند داخل Database Transaction واحدة.
- الـquote لا يغير المخزون أو الفاتورة، وإنما يعيد معاينة محسوبة فقط.
- إعادة نفس طلب التنفيذ بنفس `Idempotency-Key` تعيد نفس النتيجة بدون تكرار حركة المخزون أو الدفع.

## 1. تفاصيل الفاتورة

```http
GET /api/v1/sales-invoices/{invoice_id}
```

### Response

```json
{
  "id": "invoice-1",
  "invoice_number": "INV-2026-001",
  "status": "completed",
  "payment_method": "cash",
  "subtotal": 800,
  "discount_amount": 50,
  "tax_amount": 0,
  "total_amount": 750,
  "paid_amount": 750,
  "remaining_amount": 0,
  "created_at": "2026-09-12T10:00:00Z",
  "customer": {
    "id": "customer-1",
    "name": "أحمد محمد",
    "phone": "01000000000",
    "address": "القاهرة"
  },
  "cashier": {
    "id": "cashier-1",
    "name": "محمد"
  },
  "sales_person": {
    "id": "sales-1",
    "name": "منى"
  },
  "items": [
    {
      "id": "invoice-item-1",
      "variant_id": "variant-1",
      "product_name": "عباية سوداء",
      "category_name": "عبايات",
      "sku": "ABAYA-BLK-M",
      "size": "M",
      "color": "أسود",
      "quantity": 2,
      "returned_quantity": 0,
      "returnable_quantity": 2,
      "unit_price": 400,
      "line_total": 800,
      "variant_version": 4
    }
  ]
}
```

الحقول الأساسية للفلو:

- `items[].id`: يرسل إلى الباك كـ`invoice_item_id`.
- `returnable_quantity`: أقصى كمية يمكن إرجاعها حاليًا.
- `returned_quantity`: الكمية التي أُرجعت سابقًا.
- `unit_price`: سعر البند وقت البيع.
- `variant_id`: معرف نسخة المنتج.
- `variant_version`: نسخة المخزون الحالية عند توفرها.

## 2. سجل عمليات الفاتورة

```http
GET /api/v1/sales-invoices/{invoice_id}/operations
```

### Response

```json
{
  "operations": [
    {
      "id": "return-1",
      "number": "RET-2026-001",
      "type": "return",
      "status": "completed",
      "return_total": 400,
      "created_at": "2026-09-12T12:00:00Z"
    },
    {
      "id": "exchange-1",
      "number": "EXC-2026-001",
      "type": "exchange",
      "status": "completed",
      "return_total": 400,
      "replacement_total": 500,
      "difference_amount": 100,
      "difference_direction": "customer_pays",
      "created_at": "2026-09-12T13:00:00Z"
    }
  ]
}
```

## 3. المنتجات المتاحة كبدائل

```http
GET /api/v1/pos/catalog?page=1&page_size=100&search=&category_id=&in_stock=true
```

يفضل أن يرجع كل Variant كعنصر مستقل.

### Response

```json
{
  "items": [
    {
      "id": "variant-2",
      "product_id": "product-2",
      "name": "عباية بديلة",
      "sku": "ALT-BLK-L",
      "barcode": "622100012",
      "size": "L",
      "color": "أسود",
      "sale_price": 450,
      "stock_qty": 5,
      "version": 3,
      "category": {
        "id": "category-1",
        "name": "عبايات"
      }
    }
  ],
  "page": 1,
  "page_size": 100,
  "total": 1
}
```

عند إرسال `in_stock=true` يجب ألا تظهر الـVariants التي مخزونها صفر.

## 4. معاينة المرتجع

```http
POST /api/v1/sales-invoices/{invoice_id}/returns/quote
```

### Request

```json
{
  "reason": "مقاس غير مناسب",
  "refund_method": "cash",
  "return_items": [
    {
      "invoice_item_id": "invoice-item-1",
      "quantity": 1
    }
  ]
}
```

قيم `refund_method` المدعومة:

- `cash`
- `store_credit`

### Response

```json
{
  "invoice_id": "invoice-1",
  "subtotal": 400,
  "discount_adjustment": 25,
  "tax_adjustment": 0,
  "return_total": 375,
  "refund_amount": 375,
  "refund_method": "cash",
  "items": [
    {
      "invoice_item_id": "invoice-item-1",
      "product_name": "عباية سوداء",
      "quantity": 1,
      "unit_price": 400,
      "discount_share": 25,
      "tax_share": 0,
      "return_total": 375
    }
  ],
  "warnings": []
}
```

## 5. تنفيذ المرتجع

```http
POST /api/v1/sales-invoices/{invoice_id}/returns
Idempotency-Key: <uuid>
```

يستقبل نفس بيانات طلب معاينة المرتجع.

### Response

```json
{
  "id": "return-2",
  "number": "RET-2026-002",
  "invoice_id": "invoice-1",
  "status": "completed",
  "reason": "مقاس غير مناسب",
  "refund_method": "cash",
  "subtotal": 400,
  "discount_adjustment": 25,
  "tax_adjustment": 0,
  "return_total": 375,
  "refund_amount": 375,
  "created_at": "2026-09-12T14:00:00Z",
  "items": [
    {
      "id": "return-item-1",
      "invoice_item_id": "invoice-item-1",
      "variant_id": "variant-1",
      "product_name": "عباية سوداء",
      "quantity": 1,
      "unit_price": 400,
      "return_total": 375
    }
  ],
  "invoice": {
    "id": "invoice-1",
    "status": "partially_returned",
    "returned_amount": 375
  }
}
```

عند التنفيذ يجب على الباك إند:

- زيادة مخزون الـVariant المرتجع.
- تسجيل حركة مخزون من نوع `sale_return`.
- منع إرجاع كمية أكبر من `returnable_quantity`.
- تحديث حالة الفاتورة والكميات القابلة للإرجاع.
- تسجيل رد المبلغ أو رصيد المتجر.

## 6. معاينة الاستبدال

```http
POST /api/v1/sales-invoices/{invoice_id}/exchanges/quote
```

### Request عندما يكون البديل أغلى

```json
{
  "reason": "مقاس غير مناسب",
  "refund_method": null,
  "return_items": [
    {
      "invoice_item_id": "invoice-item-1",
      "quantity": 1
    }
  ],
  "replacement_items": [
    {
      "variant_id": "variant-2",
      "quantity": 1,
      "expected_version": 3
    }
  ],
  "difference_payment": {
    "method": "cash",
    "amount": 75
  }
}
```

طرق دفع الفرق المدعومة:

- `cash`
- `card`
- `wallet`
- `instapay`

إذا كان البديل أرخص:

```json
{
  "refund_method": "cash",
  "difference_payment": null
}
```

### Response

```json
{
  "invoice_id": "invoice-1",
  "return_total": 375,
  "replacement_total": 450,
  "difference_amount": 75,
  "difference_direction": "customer_pays",
  "return_items": [
    {
      "invoice_item_id": "invoice-item-1",
      "product_name": "عباية سوداء",
      "quantity": 1,
      "total": 375
    }
  ],
  "replacement_items": [
    {
      "variant_id": "variant-2",
      "product_name": "عباية بديلة",
      "sku": "ALT-BLK-L",
      "quantity": 1,
      "unit_price": 450,
      "total": 450
    }
  ],
  "warnings": []
}
```

قيم `difference_direction`:

- `customer_pays`: العميل يدفع الفرق.
- `customer_refund`: المتجر يرد الفرق للعميل.
- `even`: لا يوجد فرق.

## 7. تنفيذ الاستبدال

```http
POST /api/v1/sales-invoices/{invoice_id}/exchanges
Idempotency-Key: <uuid>
```

يستقبل نفس بيانات طلب معاينة الاستبدال.

### Response

```json
{
  "id": "exchange-2",
  "number": "EXC-2026-002",
  "invoice_id": "invoice-1",
  "status": "completed",
  "return_total": 375,
  "replacement_total": 450,
  "difference_amount": 75,
  "difference_direction": "customer_pays",
  "payment": {
    "method": "cash",
    "amount": 75
  },
  "return_items": [
    {
      "invoice_item_id": "invoice-item-1",
      "variant_id": "variant-1",
      "product_name": "عباية سوداء",
      "quantity": 1,
      "total": 375
    }
  ],
  "replacement_items": [
    {
      "variant_id": "variant-2",
      "product_name": "عباية بديلة",
      "sku": "ALT-BLK-L",
      "quantity": 1,
      "unit_price": 450,
      "total": 450
    }
  ],
  "created_at": "2026-09-12T15:00:00Z"
}
```

عند التنفيذ يجب على الباك إند:

- زيادة مخزون المنتجات المرتجعة.
- إنقاص مخزون المنتجات البديلة.
- تسجيل حركات `exchange_in` و`exchange_out`.
- تسجيل تحصيل الفرق أو رد الفرق.
- منع المخزون السالب.
- التحقق من `expected_version`.

## 8. الأخطاء المطلوبة

### تجاوز الكمية القابلة للإرجاع

```http
409 Conflict
```

```json
{
  "error": {
    "code": "return_quantity_exceeded",
    "message": "الكمية المطلوبة أكبر من الكمية المتاحة للإرجاع."
  }
}
```

### مخزون البديل غير كافٍ

```http
409 Conflict
```

```json
{
  "error": {
    "code": "insufficient_stock",
    "message": "الكمية المطلوبة من المنتج البديل غير متاحة.",
    "fields": {
      "replacement_items.0.quantity": "المتاح حاليًا 1"
    }
  }
}
```

### تعارض نسخة المخزون

```http
409 Conflict
```

```json
{
  "error": {
    "code": "version_conflict",
    "message": "تم تحديث مخزون المنتج. أعد تحميل المنتجات.",
    "current_version": 4
  }
}
```

### فاتورة غير قابلة للإرجاع

```http
409 Conflict
```

```json
{
  "error": {
    "code": "invoice_not_returnable",
    "message": "هذه الفاتورة غير قابلة للإرجاع أو الاستبدال."
  }
}
```

### بيانات غير صحيحة

```http
422 Unprocessable Entity
```

```json
{
  "error": {
    "code": "validation_error",
    "message": "راجع بيانات العملية.",
    "fields": {
      "return_items.0.quantity": "يجب أن تكون الكمية أكبر من صفر."
    }
  }
}
```

## 9. حالات الفاتورة المقترحة

- `completed`: مكتملة ولم يحدث إرجاع.
- `partially_returned`: تم إرجاع جزء من الفاتورة.
- `returned`: تم إرجاع جميع البنود.
- `exchanged`: حدثت عملية استبدال على الفاتورة.
- `cancelled`: ملغاة وغير قابلة للإرجاع.

## 10. اختبارات قبول أساسية

1. لا يمكن إرجاع أكثر من صافي الكمية القابلة للإرجاع.
2. لا يمكن اختيار بديل بكمية أكبر من المخزون.
3. تنفيذ المرتجع يزيد المخزون مرة واحدة فقط.
4. تنفيذ الاستبدال يزيد المرتجع وينقص البديل داخل Transaction واحدة.
5. فشل أي جزء من الاستبدال يلغي العملية بالكامل.
6. إعادة الطلب بنفس `Idempotency-Key` لا تكرر المخزون أو المدفوعات.
7. تعارض `expected_version` يرجع `409` ولا يحدث أي تعديل.
8. نتيجة الـquote تطابق نتيجة التنفيذ ما لم يتغير المخزون أو إصدار البيانات.
9. بعد التنفيذ، يعيد Endpoint تفاصيل الفاتورة قيم `returned_quantity` و`returnable_quantity` المحدثة.
