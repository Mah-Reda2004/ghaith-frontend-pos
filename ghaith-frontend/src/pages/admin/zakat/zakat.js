import { debounce } from "../../../core/utils.js";

export function initZakat(){
  const search=document.getElementById("zakatSearch");
  const body=document.getElementById("zakatTableBody");
  const empty=document.getElementById("zakatEmpty");
  const info=document.getElementById("zakatInfo");
  const rows=[...body.querySelectorAll("tr")];
  const filter=debounce(()=>{const query=search.value.trim().toLocaleLowerCase("ar");let visible=0;rows.forEach(row=>{const show=row.dataset.search.toLocaleLowerCase("ar").includes(query);row.hidden=!show;if(show)visible++});body.hidden=!visible;empty.hidden=Boolean(visible);info.textContent=visible?`عرض 1 إلى ${visible} من ${visible} صنف`:"لا توجد نتائج"},150);
  const onPage=e=>{const button=e.target.closest(".page-btn");if(!button||!/^\d+$/.test(button.textContent.trim()))return;document.querySelectorAll(".zakat-table-card .page-btn").forEach(item=>item.classList.toggle("is-active",item===button))};
  const pagination=document.querySelector(".zakat-table-card .pagination");
  search.addEventListener("input",filter);pagination.addEventListener("click",onPage);
  return()=>{search.removeEventListener("input",filter);pagination.removeEventListener("click",onPage)};
}
