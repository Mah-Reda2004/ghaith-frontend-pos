import { api } from "../../../core/api.js";
export function initSettings() {
  const form = document.getElementById("integrationsForm"), feedback = document.getElementById("integrationsFeedback"), saveButton = document.getElementById("saveIntegrations");
  const controls = { whatsapp_enabled: document.getElementById("whatsappEnabled"), whatsapp_api_url: document.getElementById("whatsappApiUrl"), whatsapp_api_key: document.getElementById("whatsappApiKey"), email_enabled: document.getElementById("emailEnabled"), manager_whatsapp_phone: document.getElementById("managerWhatsappPhone"), manager_email: document.getElementById("managerEmail") };
  const setFeedback = (message, isError = false) => { feedback.textContent = message; feedback.classList.toggle("is-error", isError); };
  const fill = response => {
    const data = response?.data || response?.settings || response?.integrations || response || {};
    controls.whatsapp_enabled.checked = Boolean(data.whatsapp_enabled);
    controls.email_enabled.checked = Boolean(data.email_enabled);
    Object.entries(controls).filter(([, control]) => control.type !== "checkbox").forEach(([key, control]) => { control.value = data[key] || ""; });
  };
  const getPayload = () => ({ whatsapp_enabled: controls.whatsapp_enabled.checked, whatsapp_api_url: controls.whatsapp_api_url.value.trim() || null, whatsapp_api_key: controls.whatsapp_api_key.value.trim() || null, email_enabled: controls.email_enabled.checked, manager_whatsapp_phone: controls.manager_whatsapp_phone.value.trim() || null, manager_email: controls.manager_email.value.trim() || null });
  const validate = data => {
    if (data.whatsapp_enabled && !data.whatsapp_api_url) return "رابط WhatsApp API مطلوب عند تفعيل واتساب.";
    if (data.whatsapp_enabled && !data.whatsapp_api_key) return "مفتاح WhatsApp API مطلوب عند تفعيل واتساب.";
    if (data.whatsapp_enabled && !data.manager_whatsapp_phone) return "رقم واتساب المدير مطلوب عند تفعيل واتساب.";
    if (data.email_enabled && !data.manager_email) return "بريد المدير مطلوب عند تفعيل البريد الإلكتروني.";
    if (data.manager_email && !controls.manager_email.checkValidity()) return "أدخل بريدًا إلكترونيًا صحيحًا.";
    if (data.whatsapp_api_url && !controls.whatsapp_api_url.checkValidity()) return "أدخل رابط WhatsApp API صحيحًا.";
    return "";
  };
  const load = async () => { setFeedback("جاري تحميل الإعدادات..."); try { fill(await api.get("/api/v1/admin/settings/integrations")); setFeedback(""); } catch (error) { setFeedback(error.message, true); } };
  const submit = async event => { event.preventDefault(); const data = getPayload(), error = validate(data); if (error) { setFeedback(error, true); return; } saveButton.disabled = true; setFeedback("جاري حفظ الإعدادات..."); try { fill(await api.patch("/api/v1/admin/settings/integrations", data)); setFeedback("تم حفظ إعدادات التكاملات بنجاح."); } catch (apiError) { setFeedback(apiError.message, true); } finally { saveButton.disabled = false; } };
  const keyButton = document.getElementById("toggleWhatsappKey");
  const toggleKey = () => { const hidden = controls.whatsapp_api_key.type === "password"; controls.whatsapp_api_key.type = hidden ? "text" : "password"; keyButton.textContent = hidden ? "إخفاء" : "إظهار"; };
  form.addEventListener("submit", submit); keyButton.addEventListener("click", toggleKey); load();
  return () => { form.removeEventListener("submit", submit); keyButton.removeEventListener("click", toggleKey); };
}
