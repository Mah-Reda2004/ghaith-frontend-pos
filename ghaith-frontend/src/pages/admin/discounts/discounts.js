export function initDiscounts(){
  window.bindAdminThemeToggle?.(document.getElementById("discountsThemeToggle"));
  const table=document.getElementById("discountTableBody");
  const modal=document.getElementById("discountModal");
  const form=document.getElementById("discountForm");
  const title=document.getElementById("discountModalTitle");
  const name=document.getElementById("discountName");
  const value=document.getElementById("discountValue");
  const error=document.getElementById("discountError");
  const success=document.getElementById("discountSuccess");
  let editingRow=null;
  const rows=()=>[...table.querySelectorAll("tr")];
  const syncStats=()=>{const values=rows().map(row=>Number(row.dataset.value));document.getElementById("discountTypesCount").textContent=values.length;document.getElementById("discountMax").textContent=`${Math.max(...values)}%`;document.getElementById("discountMin").textContent=`${Math.min(...values)}%`};
  const setOpen=open=>{modal.hidden=!open;document.body.style.overflow=open?"hidden":"";if(open)setTimeout(()=>name.focus(),0)};
  const openEditor=row=>{editingRow=row;title.textContent="تعديل الخصم";name.value=row.dataset.name;value.value=row.dataset.value;name.readOnly=true;clearError();setOpen(true)};
  const openCreator=()=>{editingRow=null;title.textContent="إضافة فئة خصم";name.value="";value.value="";name.readOnly=false;clearError();setOpen(true)};
  const clearError=()=>{error.textContent="";value.classList.remove("is-invalid");name.classList.remove("is-invalid")};
  const validate=()=>{clearError();const amount=Number(value.value);if(!name.value.trim()){error.textContent="يرجى إدخال نوع العميل";name.classList.add("is-invalid");return false}if(value.value===""||!Number.isFinite(amount)||amount<0||amount>100){error.textContent="يجب أن تكون نسبة الخصم بين 0% و100%";value.classList.add("is-invalid");return false}return true};
  const rowMarkup=(customer,amount)=>`<td><strong>${customer}</strong></td><td><b class="${amount>=15?"is-warning-text":amount>0?"is-orange-text":""}">${amount}%</b></td><td><button class="discount-status is-active" type="button">نشط</button></td><td><button class="discount-edit" type="button" aria-label="تعديل خصم ${customer}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m4 16-1 5 5-1L19 9l-4-4L4 16Z"/></svg></button></td>`;
  const submit=e=>{e.preventDefault();if(!validate())return;const customer=name.value.trim();const amount=Number(value.value);if(editingRow){editingRow.dataset.value=amount;editingRow.innerHTML=rowMarkup(customer,amount)}else{const row=document.createElement("tr");row.dataset.name=customer;row.dataset.value=amount;row.dataset.status="active";row.innerHTML=rowMarkup(customer,amount);table.append(row)}syncStats();setOpen(false);success.hidden=false;setTimeout(()=>{success.hidden=true},3500)};
  const onTable=e=>{const edit=e.target.closest(".discount-edit");if(edit){openEditor(edit.closest("tr"));return}const status=e.target.closest(".discount-status");if(status){const active=status.classList.toggle("is-active");status.classList.toggle("is-inactive",!active);status.textContent=active?"نشط":"متوقف";status.closest("tr").dataset.status=active?"active":"inactive"}};
  const onModal=e=>{if(e.target===modal||e.target.closest("[data-close]"))setOpen(false)};
  const onKey=e=>{if(e.key==="Escape"&&!modal.hidden)setOpen(false)};
  table.addEventListener("click",onTable);modal.addEventListener("click",onModal);form.addEventListener("submit",submit);document.getElementById("addDiscount").addEventListener("click",openCreator);document.getElementById("closeSuccess").addEventListener("click",()=>{success.hidden=true});document.addEventListener("keydown",onKey);value.addEventListener("input",clearError);
  syncStats();
  return()=>{document.body.style.overflow="";table.removeEventListener("click",onTable);modal.removeEventListener("click",onModal);form.removeEventListener("submit",submit);document.removeEventListener("keydown",onKey)};
}
