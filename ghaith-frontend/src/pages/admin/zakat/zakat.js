export function initZakat() {
  const body = document.getElementById("zakatTableBody"), empty = document.getElementById("zakatEmpty"), info = document.getElementById("zakatInfo"), search = document.getElementById("zakatSearch");
  body.innerHTML = "";
  body.hidden = true;
  empty.hidden = false;
  empty.querySelector("h3").textContent = "خدمة الزكاة غير متاحة في الـ API الحالي";
  empty.querySelector("p").textContent = "لم يُعرّف الباك إند مسارًا لحساب الزكاة أو تقييم المخزون حتى الآن.";
  info.textContent = "لا توجد بيانات من الخادم";
  search.disabled = true;
  return () => {};
}
