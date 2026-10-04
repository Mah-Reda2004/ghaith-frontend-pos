import { api } from "../../../core/api.js";
export function initSettings() {
  const form = document.getElementById("integrationsForm"), feedback = document.getElementById("integrationsFeedback"), saveButton = document.getElementById("saveIntegrations"), testEmailButton = document.getElementById("testEmailButton"), emailTestFeedback = document.getElementById("emailTestFeedback");
  const controls = { whatsapp_enabled: document.getElementById("whatsappEnabled"), whatsapp_api_url: document.getElementById("whatsappApiUrl"), whatsapp_api_key: document.getElementById("whatsappApiKey"), email_enabled: document.getElementById("emailEnabled"), manager_whatsapp_phone: document.getElementById("managerWhatsappPhone"), manager_email: document.getElementById("managerEmail") };
  let settingsLoaded = false;
  const setFeedback = (message, isError = false) => { feedback.textContent = message; feedback.classList.toggle("is-error", isError); };
  const setEmailTestFeedback = (message, isError = false) => { emailTestFeedback.textContent = message; emailTestFeedback.classList.toggle("is-error", isError); };
  const fill = response => {
    const data = response?.data || response?.settings || response?.integrations || response || {};
    controls.whatsapp_enabled.checked = Boolean(data.whatsapp_enabled);
    controls.email_enabled.checked = Boolean(data.email_enabled);
    Object.entries(controls).filter(([, control]) => control.type !== "checkbox").forEach(([key, control]) => { control.value = data[key] || ""; });
  };
  const getPayload = () => ({ whatsapp_enabled: controls.whatsapp_enabled.checked, whatsapp_api_url: controls.whatsapp_api_url.value.trim() || null, whatsapp_api_key: controls.whatsapp_api_key.value.trim() || null, email_enabled: controls.email_enabled.checked, manager_whatsapp_phone: controls.manager_whatsapp_phone.value.trim() || null, manager_email: controls.manager_email.value.trim() || null });
  const validate = data => {
    if (data.manager_email && !controls.manager_email.checkValidity()) return "أدخل بريدًا إلكترونيًا صحيحًا.";
    return "";
  };
  const load = async () => { setFeedback("جاري تحميل الإعدادات..."); testEmailButton.disabled = true; try { fill(await api.get("/api/v1/admin/settings/integrations")); settingsLoaded = true; testEmailButton.disabled = false; setFeedback(""); } catch (error) { setFeedback(error.message, true); } };
  const submit = async event => { event.preventDefault(); const data = getPayload(), error = validate(data); if (error) { setFeedback(error, true); return; } saveButton.disabled = true; setFeedback("جاري حفظ الإعدادات..."); try { fill(await api.patch("/api/v1/admin/settings/integrations", data)); setFeedback("تم حفظ إعدادات التكاملات بنجاح."); } catch (apiError) { setFeedback(apiError.message, true); } finally { saveButton.disabled = false; } };
  const sendTestEmail = async () => {
    if (!settingsLoaded) { setEmailTestFeedback("انتظر تحميل الإعدادات أولًا.", true); return; }
    const data = getPayload(), email = data.manager_email;
    if (!email) { setEmailTestFeedback("أدخل بريد المالك أولًا.", true); controls.manager_email.focus(); return; }
    if (!controls.manager_email.checkValidity()) { setEmailTestFeedback("أدخل بريدًا إلكترونيًا صحيحًا.", true); controls.manager_email.focus(); return; }
    testEmailButton.disabled = true;
    saveButton.disabled = true;
    setEmailTestFeedback("جاري حفظ إعدادات البريد ثم إرسال رسالة الاختبار...");
    try {
      await api.patch("/api/v1/admin/settings/integrations", { manager_email: email, email_enabled: data.email_enabled });
      const result = await api.post("/api/v1/admin/settings/integrations/email/test");
      const response = result?.data || result;
      setEmailTestFeedback(response?.message || `تم إرسال رسالة الاختبار إلى ${email}.`);
    } catch (error) {
      setEmailTestFeedback(error.message || "تعذر إرسال رسالة الاختبار.", true);
    } finally { saveButton.disabled = false; testEmailButton.disabled = false; }
  };
  const keyButton = document.getElementById("toggleWhatsappKey");
  const toggleKey = () => { const hidden = controls.whatsapp_api_key.type === "password"; controls.whatsapp_api_key.type = hidden ? "text" : "password"; keyButton.textContent = hidden ? "إخفاء" : "إظهار"; };
  form.addEventListener("submit", submit); keyButton.addEventListener("click", toggleKey); testEmailButton.addEventListener("click", sendTestEmail); load();
  return () => { form.removeEventListener("submit", submit); keyButton.removeEventListener("click", toggleKey); testEmailButton.removeEventListener("click", sendTestEmail); };
}
