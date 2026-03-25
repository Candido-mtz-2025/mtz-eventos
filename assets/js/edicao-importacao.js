    // --- FUNÇÕES DE EDIÇÃO ---
    function abrirEditarLocador(id) { const c = locadores.find(x => x.id === id); if(!c) return; document.getElementById('editLocId').value = c.id; document.getElementById('editLocNome').value = c.nome; document.getElementById('editLocEmail').value = c.email || ''; document.getElementById('editLocTel').value = c.telefone || ''; document.getElementById('modalEditarLocador').classList.add('active'); }
    function salvarEdicaoLocador() { 
    const id = parseInt(document.getElementById('editLocId').value); 
    const c = locadores.find(x => x.id === id); 
    
    if(c) { 
        c.nome = document.getElementById('editLocNome').value; 
        c.email = document.getElementById('editLocEmail').value; 
        c.telefone = document.getElementById('editLocTel').value; 
        
        salvarLocal(); 
        renderTudo(); 
        sincronizar('salvar'); 
        
        document.getElementById('modalEditarLocador').classList.remove('active');
        
        // CORREÇÃO: Aspas corretas e variável c.nome
        registrarLog('cliente', 'editar', `Cliente editado: ${c.nome}`);
        
        mostrarToast("Cliente atualizado!"); 
    } 
}
    
    function abrirEditarTipo(id) { const t = tipos.find(x => x.id === id); if(!t) return; document.getElementById('editTipoId').value = t.id; document.getElementById('editTipoNome').value = t.nome; document.getElementById('editTipoDesc').value = t.desc || ''; document.getElementById('modalEditarTipo').classList.add('active'); }
    function salvarEdicaoTipo() { const id = parseInt(document.getElementById('editTipoId').value); const t = tipos.find(x => x.id === id); if(t) { t.nome = document.getElementById('editTipoNome').value; t.desc = document.getElementById('editTipoDesc').value; salvarLocal(); renderTudo(); sincronizar('salvar'); document.getElementById('modalEditarTipo').classList.remove('active'); mostrarToast("Tipo atualizado!"); } }

    function abrirEditarPeca(id) { const p = pecas.find(x => x.id === id); if(!p) return; document.getElementById('editPecaId').value = p.id; document.getElementById('editPecaCod').value = p.codigo; document.getElementById('editPecaNome').value = p.nome; document.getElementById('editPecaValor').value = p.valor; document.getElementById('editPecaQtd').value = p.quantidade; updateSelects(); const sel = document.getElementById('editPecaTipo'); if(sel) sel.value = p.tipoId || 0; document.getElementById('modalEditarPeca').classList.add('active'); }
    function salvarEdicaoPeca() { const id = parseInt(document.getElementById('editPecaId').value); const p = pecas.find(x => x.id === id); if(p) { const novaQtd = parseInt(document.getElementById('editPecaQtd').value); const diff = novaQtd - (p.quantidade || 0); p.codigo = document.getElementById('editPecaCod').value; p.nome = document.getElementById('editPecaNome').value; p.valor = parseFloat(document.getElementById('editPecaValor').value); p.tipoId = parseInt(document.getElementById('editPecaTipo').value); p.quantidade = novaQtd; p.disponivel = (p.disponivel || 0) + diff; salvarLocal(); renderTudo(); sincronizar('salvar'); document.getElementById('modalEditarPeca').classList.remove('active'); registrarLog('item', 'editar', `Item atualizado: ${p.nome}`); mostrarToast("Item atualizado!"); } }

    function salvarConfig() { const elRodape = document.getElementById('confRodape'); const elTel = document.getElementById('confTel'); const elEmail = document.getElementById('confEmail'); if(elRodape) config.rodape = elRodape.value; if(elTel) config.tel = elTel.value; if(elEmail) config.email = elEmail.value; salvarLocal(); sincronizar('salvar'); mostrarToast("Config salva!"); }
    
   // --- EXCEL INTELIGENTE (CORRIGIDO) ---
function processarExcelInteligente(input) {
    if(!input.files || !input.files[0]) return;
    
    // 1. DEFINIR STATS NO TOPO (Essencial para não dar erro)
    let stats = { importados: 0, categorias: 0 };

    // Proteções de segurança
    if (typeof pecas === 'undefined' || !Array.isArray(pecas)) pecas = [];
    if (typeof tipos === 'undefined' || !Array.isArray(tipos)) tipos = [];

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const firstSheet = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheet];
            const rows = XLSX.utils.sheet_to_json(worksheet, {header: 1});

            if(!rows.length) return;
            if(!confirm(`Importar ${rows.length} linhas?`)) return;

            let catAtualId = garantirCategoriaGeral();

            rows.forEach(row => {
                if (!row || row.length === 0) return;
                
                const dados = {
                    nome: row[0] ? String(row[0]).trim() : "",
                    colAno: row[1], 
                    colQtd: row[3]  
                };

                if (ehCabecalhoCategoria(dados)) {
                    catAtualId = definirOuCriarCategoria(dados.nome);
                    return; 
                }

                if (ehItemValido(dados)) {
                    const nomeFormatado = aplicarRegraMedidas(dados.nome);
                    const quantidade = definirQuantidade(dados);
                    cadastrarItemSeNovo(nomeFormatado, quantidade, catAtualId);
                }
            });

            finalizarImportacao(stats);

        } catch(err) { 
            console.error(err);
            alert("Erro ao ler Excel: " + err.message);
        }
    };
    reader.readAsArrayBuffer(input.files[0]);

    // === FUNÇÕES AJUDANTES (DENTRO DA PRINCIPAL) ===

    function ehCabecalhoCategoria(d) {
        return d.colAno == 2026 || String(d.colAno).includes("2026");
    }

    function ehItemValido(d) {
        return d.nome && d.nome !== "TOTAL EM METROS";
    }

    function garantirCategoriaGeral() {
        if (!Array.isArray(tipos)) tipos = [];
        let cat = tipos.find(t => t.nome === "Geral");
        if (!cat) {
            cat = { id: Date.now(), nome: "Geral", desc: "Padrão" };
            tipos.push(cat);
        }
        return cat.id;
    }

    function definirOuCriarCategoria(nomeBruto) {
        const nome = nomeBruto.replace(/[\r\n]+/g, "").trim();
        let cat = tipos.find(t => t.nome.toUpperCase() === nome.toUpperCase());
        if (!cat) {
            cat = { id: Date.now() + Math.random(), nome: nome, desc: "Importado Excel" };
            tipos.push(cat);
            stats.categorias++;
        }
        return cat.id;
    }

    function aplicarRegraMedidas(nome) {
        if (/^[\d.,]+$/.test(nome)) {
            let valor = parseFloat(nome.replace(',', '.'));
            if (!isNaN(valor)) {
                if (valor < 1) return Math.round(valor * 100) + 'cm'; 
                return valor + 'm'; 
            }
        }
        return nome;
    }

    function definirQuantidade(d) {
        let q = parseInt(d.colQtd);       
        if (isNaN(q)) q = parseInt(d.colAno); 
        return isNaN(q) ? 0 : q;
    }

    function cadastrarItemSeNovo(nome, qtd, catId) {
        if (!Array.isArray(pecas)) pecas = [];
        const existe = pecas.find(p => p.nome === nome && p.tipoId === catId);

        if (!existe) {
            pecas.push({
                id: Date.now() + Math.random(),
                codigo: 'IMP-' + Math.floor(Math.random() * 100000),
                nome: nome,
                quantidade: qtd,
                disponivel: qtd,
                valor: 0,
                tipoId: catId,
                medida: ''
            });
            stats.importados++;
        }
    }

    function finalizarImportacao(s) {
        salvarLocal();
        renderTudo();
        sincronizar('salvar');
        mostrarToast(`Sucesso! ${s.importados} itens importados.`);
    }

} // <--- FIM DA FUNÇÃO
   
    function getHeaderMTZ() {
        return `
        <div style="background:#ffffff; color:#000000; padding:20px; text-align:center; border-bottom: 2px solid #2563eb; margin-bottom: 20px;">
            <img src="./logo.png" alt="MTZ Eventos" style="height: 140px; object-fit: contain;">
        </div>`;
    }
    
    function getFooterMTZ() { 
        return `<div style="position: absolute; bottom: 0; left: 0; width: 100%; background-color: #000000; text-align: center; padding: 15px 0; z-index: 10;"> 
            <div style="color: #ffffff !important; font-size: 10px; font-family: 'Inter', sans-serif;"> 
                ${config.rodape} | ${config.tel} | ${config.email} 
            </div> 
        </div>`;
    }
    
    function prepararModalRelatorio(id, titulo) {
        const l = locacoes.find(x => x.id === id); if(!l) return;
        const c = locadores.find(x => x.id === l.locadorId) || { nome: 'Removido', email: '-', telefone: '-' };
        
        // VERIFICA SE É ROMANEIO
        const isRomaneio = titulo.includes("ROMANEIO");

        // 1. GERA AS LINHAS
        let totalItens = 0;
        let totalQtd = 0;

        const linhasItens = l.items.map(item => { 
            const sub = item.valor * item.quantidade; 
            totalItens += sub; 
            totalQtd += parseInt(item.quantidade||0);

            if (isRomaneio) {
                // VISUAL DO ROMANEIO (Simples)
                return `<tr style="border-bottom:1px solid #e5e7eb;"> 
                    <td style="padding:10px; font-size:12px; color:#000000 !important;">${item.nome}</td> 
                    <td style="padding:10px; text-align:center; font-size:12px; color:#000000 !important;">${item.quantidade}</td> 
                    <td style="padding:10px; text-align:center; font-size:12px; color:#cccccc !important;">[ ___ ]</td> 
                </tr>`; 
            }
            
            // VISUAL DO CONTRATO (Completo)
            return `<tr style="border-bottom:1px solid #e5e7eb;"> 
                <td style="padding:10px; font-size:12px; color:#000000 !important;">${item.nome}</td> 
                <td style="padding:10px; text-align:center; font-size:12px; color:#000000 !important;">${item.quantidade}</td> 
                <td style="padding:10px; text-align:right; font-size:12px; color:#000000 !important;">R$ ${item.valor.toFixed(2)}</td> 
                <td style="padding:10px; text-align:right; font-size:12px; color:#000000 !important;">R$ ${sub.toFixed(2)}</td> 
                <td style="padding:10px; text-align:center; font-size:12px; color:#cccccc !important;">[ ]</td> 
            </tr>`; 
        }).join('');

        // CÁLCULOS
        let div = parseFloat(l.divisorFatura || 1); if(div <= 0) div = 1;
        const totalFinal = totalItens / div;
        const valorImposto = totalFinal - totalItens;
        const porcentagemImposto = (1 - div) * 100;

        // CABEÇALHOS DIFERENTES
        let cabecalhoTabela = '';
        let rodapeValores = '';
        
        // VARIÁVEL PARA OS TERMOS DE USO
        let termosJuridicos = '';

        if(isRomaneio) {
            cabecalhoTabela = `<tr><th style="padding:10px; text-align:left; font-size:11px; color:white !important;">ITEM</th><th style="padding:10px; text-align:center; font-size:11px; color:white !important;">QTD</th><th style="padding:10px; text-align:center; font-size:11px; color:white !important;">CONFERÊNCIA</th></tr>`;
            rodapeValores = `<h3 style="margin:0; font-size:16px; color:#000000 !important;">TOTAL DE VOLUMES: ${totalQtd}</h3>`;
        } else {
            cabecalhoTabela = `<tr><th style="padding:10px; text-align:left; font-size:11px; color:white !important;">ITEM</th><th style="padding:10px; text-align:center; font-size:11px; color:white !important;">QTD</th><th style="padding:10px; text-align:right; font-size:11px; color:white !important;">UNIT.</th><th style="padding:10px; text-align:right; font-size:11px; color:white !important;">TOTAL</th><th style="padding:10px; text-align:center; font-size:11px; color:white !important;">CHECK</th></tr>`;
            
            rodapeValores = `${div < 1 ? `<div style="margin-bottom:10px; font-size:12px; color:#444;">Itens: R$ ${totalItens.toFixed(2)} | Taxas: R$ ${valorImposto.toFixed(2)}</div>` : ''}
                             <h3 style="margin:0; font-size:22px; color:#000000 !important;">TOTAL A PAGAR: R$ ${totalFinal.toFixed(2)}</h3>`;

            // AQUI ESTÁ A MÁGICA: OS TERMOS JURÍDICOS (Só aparecem no contrato)
            termosJuridicos = `
            <div style="margin-top: 30px; padding: 10px; border: 1px solid #000; font-size: 9px; text-align: justify; background: #f9f9f9;">
                <strong>TERMOS E CONDIÇÕES DE LOCAÇÃO:</strong><br>
                1. O LOCATÁRIO declara receber os materiais acima listados em perfeito estado de conservação e funcionamento.<br>
                2. Compromete-se a devolvê-los na data estipulada. O atraso na devolução implicará em cobrança de novas diárias.<br>
                3. Em caso de perda, roubo ou danos aos equipamentos, o LOCATÁRIO arcará com o custo total de reposição ou reparo dos mesmos, conforme valor de mercado.<br>
                4. O transporte e manuseio dos itens são de responsabilidade do LOCATÁRIO, salvo acordo contrário descrito neste documento.
            </div>`;
        }

        // 2. MONTAGEM FINAL
        const layout = `<div style="background:#ffffff !important; min-height:100%; width:100%; position:relative; display:flex; flex-direction:column; padding:0; color: #000000 !important;"> 
            <div style="flex: 1;"> 
                ${getHeaderMTZ()} 
                <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:30px; border-bottom: 2px solid #000000; padding-bottom:15px;"> 
                    <h2 style="margin:0; font-size:24px; color:#000000 !important; text-transform:uppercase;">${titulo}</h2> 
                    <div style="text-align:right; font-size:12px;"> <strong>Nº:</strong> #${l.id.toString().slice(-4)}<br> <strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')} </div> 
                </div> 
                <div style="display:flex; gap:40px; margin-bottom:30px;"> 
                    <div style="flex:1;"> 
                        <div style="font-size:10px; color:#666 !important; font-weight:bold; border-bottom:1px solid #eee; margin-bottom:5px;">CLIENTE</div> 
                        <div style="font-weight:bold;">${c.nome}</div> 
                        <div style="font-size:12px;">${c.telefone}</div> 
                    </div> 
                    <div style="flex:1; text-align:right;"> 
                        <div style="font-size:10px; color:#666 !important; font-weight:bold; border-bottom:1px solid #eee; margin-bottom:5px;">PERÍODO</div> 
                        <div style="font-size:13px;">De: <strong>${formatarData(l.dataAluguel).replace(/<[^>]*>/g, '')}</strong></div> 
                        <div style="font-size:13px;">Até: <strong>${formatarData(l.dataDevolucaoPrevisao).replace(/<[^>]*>/g, '')}</strong></div> 
                    </div> 
                </div> 

                <table style="width:100%; border-collapse:collapse; margin-bottom:30px;"> 
                    <thead style="background:#000000 !important; color:white !important;">${cabecalhoTabela}</thead> 
                    <tbody>${linhasItens}</tbody> 
                </table> 
                
                <div style="text-align:right; margin-bottom:20px;">${rodapeValores}</div> 

                ${termosJuridicos}

                <div style="display:flex; justify-content:space-between; margin-top:60px;"> 
                    <div style="text-align:center; width:40%;"> <div style="border-top:1px solid #000; padding-top:10px; font-size:11px;">MTZ EVENTOS</div> </div> 
                    <div style="text-align:center; width:40%;"> <div style="border-top:1px solid #000; padding-top:10px; font-size:11px;">${c.nome.toUpperCase()}</div> </div> 
                </div> 
            </div> 
            ${getFooterMTZ()} 
        </div>`;
        
        const printArea = document.getElementById('printArea'); if(printArea) { printArea.innerHTML = layout; document.getElementById('modalRelatorio').classList.add('active'); }
    }
    function gerarRomaneio(id) { prepararModalRelatorio(id, "ROMANEIO DE SEPARAÇÃO"); }
    function gerarRecibo(id) { prepararModalRelatorio(id, "RECIBO DE DEVOLUÇÃO"); }
    function gerarRelatorio(id) { prepararModalRelatorio(id, "CONTRATO DE LOCAÇÃO"); }
   function gerarRelatorioAnual(clienteId) {
        const c = locadores.find(x => x.id === clienteId);
        if(!c) return;

        // 1. Coleta e calcula os dados
        const historico = locacoes.filter(l => l.locadorId === clienteId);
        let somaItens = 0;   // Valor só dos produtos
        let somaFinal = 0;   // Valor com impostos (Gross-up)

        // Ordena por data
        historico.sort((a,b) => new Date(b.dataAluguel) - new Date(a.dataAluguel));

        const linhas = historico.map(l => {
            let subtotal = 0;
            l.items.forEach(i => subtotal += (parseFloat(i.valor||0) * parseInt(i.quantidade||1)));
            
            // Aplica Gross-up
            let div = parseFloat(l.divisorFatura||1); if(div<=0) div=1;
            let final = subtotal / div;

            // Acumula totais gerais
            somaItens += subtotal;
            somaFinal += final;

            let st = l.status === 'devolvido' ? 'CONCLUÍDO' : (l.status === 'ativo' ? 'ATIVO' : 'ATRASADO');
            let cor = l.status === 'devolvido' ? '#10b981' : (l.status === 'ativo' ? '#3b82f6' : '#ef4444');

            return `<tr style="border-bottom: 1px solid #eee;">
                <td style="padding:10px; font-size:11px;">${formatarData(l.dataAluguel)}</td>
                <td style="padding:10px; font-size:11px;">#${l.id.toString().slice(-4)}</td>
                <td style="padding:10px; font-size:11px; text-align:right;">R$ ${subtotal.toFixed(2)}</td>
                <td style="padding:10px; font-size:11px; text-align:right; font-weight:bold;">R$ ${final.toFixed(2)}</td>
                <td style="padding:10px; text-align:center;"><span style="color:${cor}; font-weight:bold; font-size:10px;">${st}</span></td>
            </tr>`;
        }).join('');

        const totalImpostos = somaFinal - somaItens;

        // 2. Monta o Layout (Padronizado com os outros)
        const layout = `<div style="background:#fff !important; min-height:100%; width:100%; color:#000 !important;">
            ${getHeaderMTZ()}
            
            <div style="margin-bottom:30px; border-bottom:2px solid #000; padding-bottom:10px; display:flex; justify-content:space-between; align-items:flex-end;">
                <div><h2 style="margin:0; font-size:20px;">EXTRATO FINANCEIRO</h2><div style="font-size:14px; margin-top:5px;">${c.nome}</div></div>
                <div style="text-align:right; font-size:11px;">${new Date().toLocaleDateString('pt-BR')}</div>
            </div>

            <div style="display:flex; gap:15px; margin-bottom:30px;">
                <div style="flex:1; padding:15px; border:1px solid #ccc; text-align:center;">
                    <div style="font-size:10px; text-transform:uppercase; color:#666;">Subtotal Itens</div>
                    <div style="font-size:14px; font-weight:bold;">R$ ${somaItens.toFixed(2)}</div>
                </div>
                <div style="flex:1; padding:15px; border:1px solid #ccc; text-align:center;">
                    <div style="font-size:10px; text-transform:uppercase; color:#666;">Total Impostos</div>
                    <div style="font-size:14px; font-weight:bold;">R$ ${totalImpostos.toFixed(2)}</div>
                </div>
                <div style="flex:1; padding:15px; border:1px solid #000; background:#f9f9f9; text-align:center;">
                    <div style="font-size:10px; text-transform:uppercase; font-weight:bold;">TOTAL GERAL</div>
                    <div style="font-size:16px; font-weight:bold;">R$ ${somaFinal.toFixed(2)}</div>
                </div>
            </div>

            <table style="width:100%; border-collapse:collapse; margin-bottom:30px;">
                <thead style="background:#000; color:#fff;">
                    <tr>
                        <th style="padding:8px; text-align:left; font-size:10px; color:#fff !important;">DATA</th>
                        <th style="padding:8px; text-align:left; font-size:10px; color:#fff !important;">CONTRATO</th>
                        <th style="padding:8px; text-align:right; font-size:10px; color:#fff !important;">VALOR ITENS</th>
                        <th style="padding:8px; text-align:right; font-size:10px; color:#fff !important;">TOTAL (C/ IMP)</th>
                        <th style="padding:8px; text-align:center; font-size:10px; color:#fff !important;">STATUS</th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>
            
            ${getFooterMTZ()}
        </div>`;
        
        const printArea = document.getElementById('printArea'); 
        if(printArea) { 
            printArea.innerHTML = layout; 
            document.getElementById('modalRelatorio').classList.add('active'); 
        }
    }
    function gerarPDF() { 
        if (!window.jspdf || !window.html2canvas) { alert("Aguarde o carregamento das bibliotecas..."); return; } 
        const { jsPDF } = window.jspdf; 
        const elemento = document.getElementById("printArea"); 
        
        html2canvas(elemento, { scale: 2, useCORS: true, logging: false }).then(canvas => { 
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4'); 
            const pdfWidth = pdf.internal.pageSize.getWidth(); 
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight); 
            pdf.save(`MTZ_Doc_${Date.now()}.pdf`); 
        });
    }

    // --- OUTROS ---
    function carregarItensDevolucao() { 
        const id = document.getElementById('devLocacao').value; const div = document.getElementById('divItensDevolucao'); 
        div.innerHTML = ""; if(!id) return; const l = locacoes.find(x => x.id == id); if(!l) return;
        div.innerHTML = l.items.map((item) => `<div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid var(--border);"><span>${item.nome} (${item.quantidade})</span> <span class="badge badge-success">OK</span></div>`).join('');
    }
    function confirmarDevolucao() { 
    const id = document.getElementById('devLocacao').value;
    if(!id) return alert("Selecione!");
    
    const l = locacoes.find(x => x.id == id);
    l.status = 'devolvido';
    
    devolucoes.push({ 
        id: Date.now(), 
        locacaoId: l.id, 
        dataDevolucao: document.getElementById('devData').value, 
        obs: 'Total' 
    });
    
    salvarLocal();
    renderTudo();
    sincronizar('salvar');
    
    // Registra no log de auditoria
    const cliente = locadores.find(x => x.id === l.locadorId);
    registrarLog('devolucao', 'criar', `Devolução registrada: ${cliente?.nome || 'Cliente'}`);
    
    mostrarToast("Baixa confirmada!");
}

    function converterLogo() { const input = document.getElementById('confLogo'); if (input.files[0]) { const reader = new FileReader();
    reader.onloadend = function() { config.logo = reader.result; document.getElementById('previewLogo').innerHTML = `<img src="${config.logo}" style="height:50px">`; }; reader.readAsDataURL(input.files[0]); } }
    
