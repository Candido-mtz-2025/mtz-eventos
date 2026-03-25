function renderStats() {
        const elC = document.getElementById('dashClientes');
        if(elC) elC.innerText = locadores.length;
        const ativas = locacoes.filter(l => l.status === 'ativo');
        const elL = document.getElementById('dashLocacoes'); if(elL) elL.innerText = ativas.length;
        let totalRecebido = 0, totalPendente = 0;
        ativas.forEach(loc => {
            let subtotal = 0; (loc.items || []).forEach(i => subtotal += (parseFloat(i.valor||0) * parseInt(i.quantidade||1)));
            let div = parseFloat(loc.divisorFatura || 1); if(div <= 0) div = 1;
            let vf = subtotal / div;
            if (loc.pago) totalRecebido += vf; else totalPendente += vf;
        });
        const elF = document.getElementById('dashFaturamento');
        if(elF) elF.innerHTML = `<span style="color:var(--primary)">R$ ${totalRecebido.toLocaleString('pt-BR',{minimumFractionDigits:0})}</span><br><span style="font-size:0.8rem; color:var(--text-light); font-weight:400;">+ R$ ${totalPendente.toLocaleString('pt-BR',{minimumFractionDigits:0})} pendente</span>`;
        const hoje = new Date(); hoje.setHours(0,0,0,0);
        let atrasados = 0;
        let proximas = [];
        ativas.forEach(loc => {
            if(loc.dataDevolucaoPrevisao) {
                const d = new Date(loc.dataDevolucaoPrevisao); d.setHours(0,0,0,0);
                if (d < hoje) atrasados++;
                if (d >= hoje) proximas.push({ data: d, cliente: locadores.find(c => c.id === loc.locadorId)?.nome || '?' });
            }
        });
        const elA = document.getElementById('dashAtrasos'); if(elA) { elA.innerText = atrasados; elA.style.color = atrasados > 0 ? '#ef4444' : 'var(--text)'; }
        
        proximas.sort((a,b) => a.data - b.data);
        const tblDash = document.getElementById('tblDashDevolucoes');
        if(tblDash) {
            if(!proximas.length) tblDash.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:15px; opacity:0.6;">Nada previsto.</td></tr>';
            else tblDash.innerHTML = proximas.slice(0, 5).map(p => `<tr><td>${p.data.toLocaleDateString('pt-BR')}</td><td>${p.cliente}</td><td style="text-align:center"><span class="badge badge-info">AGENDADO</span></td></tr>`).join('');
        }
    }
