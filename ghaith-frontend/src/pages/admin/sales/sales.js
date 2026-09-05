import { debounce } from "../../../core/utils.js";

export function initSales(){
  window.bindAdminThemeToggle?.(document.getElementById("salesThemeToggle"));
  const body=document.getElementById("salesTableBody");
  const search=document.getElementById("salesSearch");
  const cashier=document.getElementById("salesCashier");
  const payment=document.getElementById("salesPayment");
  const status=document.getElementById("salesStatus");
  const empty=document.getElementById("salesEmpty");
  const info=document.getElementById("salesResultInfo");
  const modal=document.getElementById("salesModal");
  let activeType="all";
  const rows=[...body.querySelectorAll("tr")];
  const filter=()=>{let visible=0;const query=search.value.trim().toLocaleLowerCase("ar");rows.forEach(row=>{const show=(!query||row.dataset.search.toLocaleLowerCase("ar").includes(query))&&(!cashier.value||row.dataset.cashier===cashier.value)&&(!payment.value||row.dataset.payment===payment.value)&&(!status.value||row.dataset.type===status.value)&&(activeType==="all"||row.dataset.type===activeType);row.hidden=!show;if(show)visible++});body.hidden=!visible;empty.hidden=Boolean(visible);info.textContent=visible?`عرض 1 إلى ${visible} من أصل ${visible} نتيجة`:"لا توجد نتائج"};
  const delayedFilter=debounce(filter,150);
  const onFilters=e=>{const button=e.target.closest(".sales-filter");if(!button)return;activeType=button.dataset.filter;document.querySelectorAll(".sales-filter").forEach(item=>item.classList.toggle("is-active",item===button));filter()};
  const onPeriods=e=>{const button=e.target.closest("button");if(!button)return;document.querySelectorAll(".sales-periods button").forEach(item=>item.classList.toggle("is-active",item===button))};
  const closeModal=()=>{modal.hidden=true;document.body.style.overflow=""};
  const openModal=row=>{document.getElementById("invoiceTitle").textContent=row.cells[0].textContent.trim();document.getElementById("invoiceCustomer").textContent=row.cells[3].querySelector("strong").textContent;modal.hidden=false;document.body.style.overflow="hidden";modal.querySelector(".sales-modal__close").focus()};
  const onTable=e=>{const button=e.target.closest(".sales-view");if(button)openModal(button.closest("tr"))};
  const onModal=e=>{if(e.target.closest("[data-close-modal]"))closeModal()};
  const onKey=e=>{if(e.key==="Escape"&&!modal.hidden)closeModal()};
  const onPage=e=>{const button=e.target.closest(".page-btn");if(!button||!/^\d+$/.test(button.textContent.trim()))return;document.querySelectorAll(".sales-table-card .page-btn").forEach(item=>item.classList.toggle("is-active",item===button))};
  const salesTable=document.querySelector(".sales-table");
  const printSales=()=>window.GhaithPrint?.printTable({title:"تقرير المبيعات",subtitle:"الفواتير الظاهرة طبقًا للفلاتر المحددة",table:salesTable,summary:[{label:"إجمالي المبيعات",value:"84,520 ر.س"},{label:"صافي المبيعات",value:"79,150 ر.س"},{label:"عدد الفواتير",value:"342"},{label:"المرتجعات",value:"2,170 ر.س"}]});
  const exportSales=()=>window.GhaithPrint?.exportTableExcel({title:"تقرير المبيعات",table:salesTable,fileName:"ghaith-sales"});
  const printCurrentInvoice=()=>window.GhaithPrint?.printReceipt({title:"فاتورة مبيعات",number:document.getElementById("invoiceTitle").textContent,customer:document.getElementById("invoiceCustomer").textContent,items:[{name:"ثوب صيفي فاخر - أبيض",sku:"THB-SUM-W-42",qty:2,price:350},{name:"شماغ غيث الماسي - أحمر",sku:"SHM-GTH-R-58",qty:1,price:250}],totals:[{label:"الإجمالي الفرعي",value:950},{label:"الخصم",value:50,negative:true},{label:"الإجمالي النهائي",value:900,final:true}],payment:"مدى / نقدي"});
  search.addEventListener("input",delayedFilter);[cashier,payment,status].forEach(el=>el.addEventListener("change",filter));document.querySelector(".sales-toolbar").addEventListener("click",onFilters);document.querySelector(".sales-periods").addEventListener("click",onPeriods);body.addEventListener("click",onTable);modal.addEventListener("click",onModal);document.addEventListener("keydown",onKey);document.querySelector(".sales-table-card .pagination").addEventListener("click",onPage);document.getElementById("salesExportPdf").addEventListener("click",printSales);document.getElementById("salesExportExcel").addEventListener("click",exportSales);document.getElementById("printInvoice").addEventListener("click",printCurrentInvoice);
  return()=>{document.body.style.overflow="";search.removeEventListener("input",delayedFilter);document.querySelector(".sales-toolbar")?.removeEventListener("click",onFilters);document.querySelector(".sales-periods")?.removeEventListener("click",onPeriods);body.removeEventListener("click",onTable);modal.removeEventListener("click",onModal);document.removeEventListener("keydown",onKey)};
}
