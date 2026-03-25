// --- LÓGICA E FUNÇÕES GERAIS ---
    function mostrarToast(m,t) { const x=document.getElementById("toast");
    x.innerText=m; x.style.background=t==='erro'?'#ef4444':'#1f2937'; x.className="show"; setTimeout(()=>x.className="",3000); }
