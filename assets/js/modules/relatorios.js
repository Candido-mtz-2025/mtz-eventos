const formatadorMoedaPDF = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
});

function escaparHTMLPDF(valor) {
    const div = document.createElement('div');
    div.textContent = valor ?? '';
    return div.innerHTML;
}

function removerTagsHTML(valor) {
    return String(valor ?? '').replace(/<[^>]*>/g, '').trim();
}

function formatarMoedaPDF(valor) {
    const numero = Number(valor);
    if (!Number.isFinite(numero)) return formatadorMoedaPDF.format(0);
    return formatadorMoedaPDF.format(numero);
}

function formatarDataPDF(valor) {
    if (!valor) return '-';
    const texto = String(valor).trim();
    const yyyyMmDd = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (yyyyMmDd) return `${yyyyMmDd[3]}/${yyyyMmDd[2]}/${yyyyMmDd[1]}`;

    if (typeof formatarData === 'function') {
        const formatada = removerTagsHTML(formatarData(valor));
        if (formatada) return formatada;
    }

    const data = new Date(texto);
    if (Number.isNaN(data.getTime())) return texto;
    return data.toLocaleDateString('pt-BR');
}

function gerarNomeArquivoPDF() {
    const tituloEl = document.querySelector('#printArea h1, #printArea h2');
    const titulo = (tituloEl && tituloEl.textContent ? tituloEl.textContent.trim() : '') || 'documento';
    const base = titulo
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return `MTZ_${base || 'documento'}_${Date.now()}.pdf`;
}

function getHeaderMTZ() {
    return `
    <div style="background:#ffffff;color:#000000;padding:14px 0 16px;text-align:center;border-bottom:2px solid #2563eb;margin-bottom:18px;">
        <img src="./logo.png" alt="MTZ Eventos" style="height:90px;object-fit:contain;">
    </div>`;
}

function getFooterMTZ() {
    const rodape = escaparHTMLPDF((config && config.rodape) ? config.rodape : 'MTZ Eventos');
    const tel = escaparHTMLPDF((config && config.tel) ? config.tel : '-');
    const email = escaparHTMLPDF((config && config.email) ? config.email : '-');

    return `<div class="footer-bar" style="margin-top:28px;background:#000000;text-align:center;padding:10px 12px;">
        <div style="color:#ffffff !important;font-size:10px;font-family:'Inter',sans-serif;">
            ${rodape} | ${tel} | ${email}
        </div>
    </div>`;
}

function prepararModalRelatorio(id, titulo) {
    const l = locacoes.find(x => x.id === id);
    if (!l) return;

    const c = locadores.find(x => x.id === l.locadorId) || { nome: 'Removido', email: '-', telefone: '-' };
    const isRomaneio = titulo.includes('ROMANEIO');

    let totalItens = 0;
    let totalQtd = 0;

    const linhasItens = l.items.map(item => {
        const valorUnitario = Number(item.valor) || 0;
        const quantidade = parseInt(item.quantidade || 0, 10);
        const sub = valorUnitario * quantidade;

        totalItens += sub;
        totalQtd += quantidade;

        if (isRomaneio) {
            return `<tr style="border-bottom:1px solid #e5e7eb;">
                <td style="padding:10px; font-size:12px; color:#000000 !important;">${escaparHTMLPDF(item.nome)}</td>
                <td style="padding:10px; text-align:center; font-size:12px; color:#000000 !important;">${quantidade}</td>
                <td style="padding:10px; text-align:center; font-size:12px; color:#cccccc !important;">[ ___ ]</td>
            </tr>`;
        }

        return `<tr style="border-bottom:1px solid #e5e7eb;">
            <td style="padding:10px; font-size:12px; color:#000000 !important;">${escaparHTMLPDF(item.nome)}</td>
            <td style="padding:10px; text-align:center; font-size:12px; color:#000000 !important;">${quantidade}</td>
            <td style="padding:10px; text-align:right; font-size:12px; color:#000000 !important;">${formatarMoedaPDF(valorUnitario)}</td>
            <td style="padding:10px; text-align:right; font-size:12px; color:#000000 !important;">${formatarMoedaPDF(sub)}</td>
            <td style="padding:10px; text-align:center; font-size:12px; color:#cccccc !important;">[ ]</td>
        </tr>`;
    }).join('');

    let div = parseFloat(l.divisorFatura || 1);
    if (div <= 0) div = 1;

    const totalFinal = totalItens / div;
    const valorImposto = totalFinal - totalItens;
    const porcentagemImposto = Math.max(0, (1 - div) * 100);

    let cabecalhoTabela = '';
    let rodapeValores = '';
    let termosJuridicos = '';

    if (isRomaneio) {
        cabecalhoTabela = `<tr><th style="padding:10px; text-align:left; font-size:11px; color:white !important;">ITEM</th><th style="padding:10px; text-align:center; font-size:11px; color:white !important;">QTD</th><th style="padding:10px; text-align:center; font-size:11px; color:white !important;">CONFERÊNCIA</th></tr>`;
        rodapeValores = `<h3 style="margin:0; font-size:16px; color:#000000 !important;">TOTAL DE VOLUMES: ${totalQtd}</h3>`;
    } else {
        cabecalhoTabela = `<tr><th style="padding:10px; text-align:left; font-size:11px; color:white !important;">ITEM</th><th style="padding:10px; text-align:center; font-size:11px; color:white !important;">QTD</th><th style="padding:10px; text-align:right; font-size:11px; color:white !important;">UNIT.</th><th style="padding:10px; text-align:right; font-size:11px; color:white !important;">TOTAL</th><th style="padding:10px; text-align:center; font-size:11px; color:white !important;">CHECK</th></tr>`;

        rodapeValores = `${div < 1 ? `<div style="margin-bottom:10px; font-size:12px; color:#444;">Itens: ${formatarMoedaPDF(totalItens)} | Taxas (${porcentagemImposto.toFixed(2)}%): ${formatarMoedaPDF(valorImposto)}</div>` : ''}
            <h3 style="margin:0; font-size:22px; color:#000000 !important;">TOTAL A PAGAR: ${formatarMoedaPDF(totalFinal)}</h3>`;

        termosJuridicos = `
        <div style="margin-top: 30px; padding: 10px; border: 1px solid #000; font-size: 9px; text-align: justify; background: #f9f9f9;">
            <strong>TERMOS E CONDIÇÕES DE LOCAÇÃO:</strong><br>
            1. O LOCATÁRIO declara receber os materiais acima listados em perfeito estado de conservação e funcionamento.<br>
            2. Compromete-se a devolvê-los na data estipulada. O atraso na devolução implicará em cobrança de novas diárias.<br>
            3. Em caso de perda, roubo ou danos aos equipamentos, o LOCATÁRIO arcará com o custo total de reposição ou reparo dos mesmos, conforme valor de mercado.<br>
            4. O transporte e manuseio dos itens são de responsabilidade do LOCATÁRIO, salvo acordo contrário descrito neste documento.
        </div>`;
    }

    const layout = `<div style="background:#ffffff !important; min-height:100%; width:100%; display:flex; flex-direction:column; padding:0; color:#000000 !important;">
        <div style="flex: 1;">
            ${getHeaderMTZ()}
            <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:30px; border-bottom: 2px solid #000000; padding-bottom:15px;">
                <h2 style="margin:0; font-size:24px; color:#000000 !important; text-transform:uppercase;">${escaparHTMLPDF(titulo)}</h2>
                <div style="text-align:right; font-size:12px;"><strong>Nº:</strong> #${l.id.toString().slice(-4)}<br><strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')}</div>
            </div>

            <div style="display:flex; gap:40px; margin-bottom:30px;">
                <div style="flex:1;">
                    <div style="font-size:10px; color:#666 !important; font-weight:bold; border-bottom:1px solid #eee; margin-bottom:5px;">CLIENTE</div>
                    <div style="font-weight:bold;">${escaparHTMLPDF(c.nome)}</div>
                    <div style="font-size:12px;">${escaparHTMLPDF(c.telefone || '-')}</div>
                </div>
                <div style="flex:1; text-align:right;">
                    <div style="font-size:10px; color:#666 !important; font-weight:bold; border-bottom:1px solid #eee; margin-bottom:5px;">PERÍODO</div>
                    <div style="font-size:13px;">De: <strong>${formatarDataPDF(l.dataAluguel)}</strong></div>
                    <div style="font-size:13px;">Até: <strong>${formatarDataPDF(l.dataDevolucaoPrevisao)}</strong></div>
                </div>
            </div>

            <table style="width:100%; border-collapse:collapse; margin-bottom:30px;">
                <thead style="background:#000000 !important; color:white !important;">${cabecalhoTabela}</thead>
                <tbody>${linhasItens}</tbody>
            </table>

            <div style="text-align:right; margin-bottom:20px;">${rodapeValores}</div>
            ${termosJuridicos}

            <div style="display:flex; justify-content:space-between; margin-top:60px;">
                <div style="text-align:center; width:40%;"><div style="border-top:1px solid #000; padding-top:10px; font-size:11px;">MTZ EVENTOS</div></div>
                <div style="text-align:center; width:40%;"><div style="border-top:1px solid #000; padding-top:10px; font-size:11px;">${escaparHTMLPDF(String(c.nome || '').toUpperCase())}</div></div>
            </div>
        </div>
        ${getFooterMTZ()}
    </div>`;

    const printArea = document.getElementById('printArea');
    if (printArea) {
        printArea.innerHTML = layout;
        document.getElementById('modalRelatorio').classList.add('active');
    }
}

function gerarRomaneio(id) {
    prepararModalRelatorio(id, 'ROMANEIO DE SEPARAÇÃO');
}

function gerarRecibo(id) {
    const ultima = devolucoes.slice().reverse().find(d => d.locacaoId === id);
    if (ultima) return gerarReciboDevolucao(ultima.id);
    prepararModalRelatorio(id, 'RECIBO DE DEVOLUÇÃO');
}

function gerarReciboDevolucao(devolucaoId) {
    const d = devolucoes.find(x => x.id === devolucaoId);
    if (!d) return mostrarToast('Devolução não encontrada.', 'erro');

    const l = locacoes.find(x => x.id === d.locacaoId);
    const c = locadores.find(x => x.id === (l ? l.locadorId : 0)) || { nome: 'Removido', telefone: '-' };
    const itens = Array.isArray(d.itens) && d.itens.length ? d.itens : (l?.items || []).map(item => ({
        nome: item.nome,
        quantidadeDevolvida: item.quantidade,
        quantidadeAvaria: 0,
        quantidadePendenteApos: 0,
        observacao: ''
    }));

    const linhas = itens.map(item => `
        <tr style="border-bottom:1px solid #e5e7eb;">
            <td style="padding:10px; font-size:12px; color:#000000 !important;">${escaparHTMLPDF(item.nome)}</td>
            <td style="padding:10px; text-align:center; font-size:12px; color:#000000 !important;">${item.quantidadeDevolvida || 0}</td>
            <td style="padding:10px; text-align:center; font-size:12px; color:#000000 !important;">${item.quantidadeAvaria || 0}</td>
            <td style="padding:10px; text-align:center; font-size:12px; color:#000000 !important;">${item.quantidadePendenteApos || 0}</td>
            <td style="padding:10px; font-size:12px; color:#000000 !important;">${escaparHTMLPDF(item.observacao || '-')}</td>
        </tr>
    `).join('');

    const totalDevolvido = itens.reduce((total, item) => total + (parseInt(item.quantidadeDevolvida, 10) || 0), 0);
    const totalAvaria = itens.reduce((total, item) => total + (parseInt(item.quantidadeAvaria, 10) || 0), 0);
    const status = d.tipo === 'parcial' ? 'DEVOLUÇÃO PARCIAL' : 'DEVOLUÇÃO TOTAL';

    const layout = `<div style="background:#ffffff !important; min-height:100%; width:100%; display:flex; flex-direction:column; padding:0; color:#000000 !important;">
        <div style="flex:1;">
            ${getHeaderMTZ()}
            <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:25px; border-bottom:2px solid #000000; padding-bottom:15px;">
                <div>
                    <h2 style="margin:0; font-size:24px; color:#000000 !important;">RECIBO DE DEVOLUÇÃO</h2>
                    <div style="margin-top:6px; font-size:12px; font-weight:bold; color:#000000 !important;">${status}</div>
                </div>
                <div style="text-align:right; font-size:12px;">
                    <strong>Nº:</strong> #${d.id.toString().slice(-4)}<br>
                    <strong>Contrato:</strong> #${l ? l.id.toString().slice(-4) : '----'}<br>
                    <strong>Data:</strong> ${formatarDataPDF(d.dataDevolucao)}
                </div>
            </div>

            <div style="display:flex; gap:40px; margin-bottom:25px;">
                <div style="flex:1;">
                    <div style="font-size:10px; color:#666 !important; font-weight:bold; border-bottom:1px solid #eee; margin-bottom:5px;">CLIENTE</div>
                    <div style="font-weight:bold;">${escaparHTMLPDF(c.nome)}</div>
                    <div style="font-size:12px;">${escaparHTMLPDF(c.telefone || '-')}</div>
                </div>
                <div style="flex:1; text-align:right;">
                    <div style="font-size:10px; color:#666 !important; font-weight:bold; border-bottom:1px solid #eee; margin-bottom:5px;">RESUMO</div>
                    <div style="font-size:13px;">Devolvidos: <strong>${totalDevolvido}</strong></div>
                    <div style="font-size:13px;">Avaria/perda: <strong>${totalAvaria}</strong></div>
                </div>
            </div>

            <table style="width:100%; border-collapse:collapse; margin-bottom:30px;">
                <thead style="background:#000000 !important; color:white !important;">
                    <tr>
                        <th style="padding:10px; text-align:left; font-size:11px; color:white !important;">ITEM</th>
                        <th style="padding:10px; text-align:center; font-size:11px; color:white !important;">DEVOLVIDO</th>
                        <th style="padding:10px; text-align:center; font-size:11px; color:white !important;">AVARIA/PERDA</th>
                        <th style="padding:10px; text-align:center; font-size:11px; color:white !important;">PENDENTE</th>
                        <th style="padding:10px; text-align:left; font-size:11px; color:white !important;">OBSERVAÇÃO</th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>

            <div style="font-size:11px; padding:10px; border:1px solid #000; background:#f9f9f9; text-align:justify;">
                Este recibo registra apenas os itens conferidos nesta devolução. Quantidades pendentes permanecem vinculadas ao contrato até nova baixa.
            </div>

            <div style="display:flex; justify-content:space-between; margin-top:60px;">
                <div style="text-align:center; width:40%;"><div style="border-top:1px solid #000; padding-top:10px; font-size:11px;">MTZ EVENTOS</div></div>
                <div style="text-align:center; width:40%;"><div style="border-top:1px solid #000; padding-top:10px; font-size:11px;">${escaparHTMLPDF(String(c.nome || '').toUpperCase())}</div></div>
            </div>
        </div>
        ${getFooterMTZ()}
    </div>`;

    const printArea = document.getElementById('printArea');
    if (printArea) {
        printArea.innerHTML = layout;
        document.getElementById('modalRelatorio').classList.add('active');
    }
}

function gerarRelatorio(id) {
    prepararModalRelatorio(id, 'CONTRATO DE LOCAÇÃO');
}

function gerarRelatorioAnual(clienteId) {
    const c = locadores.find(x => x.id === clienteId);
    if (!c) return;

    const historico = locacoes.filter(l => l.locadorId === clienteId);
    let somaItens = 0;
    let somaFinal = 0;

    historico.sort((a, b) => new Date(b.dataAluguel) - new Date(a.dataAluguel));

    const linhas = historico.map(l => {
        let subtotal = 0;
        l.items.forEach(i => {
            subtotal += (parseFloat(i.valor || 0) * parseInt(i.quantidade || 1, 10));
        });

        let div = parseFloat(l.divisorFatura || 1);
        if (div <= 0) div = 1;
        const final = subtotal / div;

        somaItens += subtotal;
        somaFinal += final;

        const st = l.status === 'devolvido' ? 'CONCLUÍDO' : (l.status === 'ativo' ? 'ATIVO' : 'ATRASADO');
        const cor = l.status === 'devolvido' ? '#10b981' : (l.status === 'ativo' ? '#3b82f6' : '#ef4444');

        return `<tr style="border-bottom: 1px solid #eee;">
            <td style="padding:10px; font-size:11px;">${formatarDataPDF(l.dataAluguel)}</td>
            <td style="padding:10px; font-size:11px;">#${l.id.toString().slice(-4)}</td>
            <td style="padding:10px; font-size:11px; text-align:right;">${formatarMoedaPDF(subtotal)}</td>
            <td style="padding:10px; font-size:11px; text-align:right; font-weight:bold;">${formatarMoedaPDF(final)}</td>
            <td style="padding:10px; text-align:center;"><span style="color:${cor}; font-weight:bold; font-size:10px;">${st}</span></td>
        </tr>`;
    }).join('');

    const totalImpostos = somaFinal - somaItens;

    const layout = `<div style="background:#fff !important; min-height:100%; width:100%; color:#000 !important;">
        ${getHeaderMTZ()}

        <div style="margin-bottom:30px; border-bottom:2px solid #000; padding-bottom:10px; display:flex; justify-content:space-between; align-items:flex-end;">
            <div><h2 style="margin:0; font-size:20px;">EXTRATO FINANCEIRO</h2><div style="font-size:14px; margin-top:5px;">${escaparHTMLPDF(c.nome)}</div></div>
            <div style="text-align:right; font-size:11px;">${new Date().toLocaleDateString('pt-BR')}</div>
        </div>

        <div style="display:flex; gap:15px; margin-bottom:30px;">
            <div style="flex:1; padding:15px; border:1px solid #ccc; text-align:center;">
                <div style="font-size:10px; text-transform:uppercase; color:#666;">Subtotal Itens</div>
                <div style="font-size:14px; font-weight:bold;">${formatarMoedaPDF(somaItens)}</div>
            </div>
            <div style="flex:1; padding:15px; border:1px solid #ccc; text-align:center;">
                <div style="font-size:10px; text-transform:uppercase; color:#666;">Total Impostos</div>
                <div style="font-size:14px; font-weight:bold;">${formatarMoedaPDF(totalImpostos)}</div>
            </div>
            <div style="flex:1; padding:15px; border:1px solid #000; background:#f9f9f9; text-align:center;">
                <div style="font-size:10px; text-transform:uppercase; font-weight:bold;">TOTAL GERAL</div>
                <div style="font-size:16px; font-weight:bold;">${formatarMoedaPDF(somaFinal)}</div>
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
    if (printArea) {
        printArea.innerHTML = layout;
        document.getElementById('modalRelatorio').classList.add('active');
    }
}

function aplicarCabecalhoRodapePDF(pdf, paginaAtual, totalPaginas, tituloDoc, dataGeracao, margem, alturaCabecalho, alturaRodape) {
    const larguraPagina = pdf.internal.pageSize.getWidth();
    const alturaPagina = pdf.internal.pageSize.getHeight();
    const tituloCurto = String(tituloDoc || 'Documento MTZ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 72);

    pdf.setDrawColor(203, 213, 225);
    pdf.setLineWidth(0.2);
    pdf.line(margem, margem + alturaCabecalho - 1.6, larguraPagina - margem, margem + alturaCabecalho - 1.6);
    pdf.line(margem, alturaPagina - margem - alturaRodape + 1.8, larguraPagina - margem, alturaPagina - margem - alturaRodape + 1.8);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(15, 23, 42);
    pdf.text(tituloCurto, margem, margem + 4.6);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(71, 85, 105);
    pdf.text(dataGeracao, larguraPagina - margem, margem + 4.6, { align: 'right' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(30, 41, 59);
    const textoPagina = `Pagina ${paginaAtual} de ${totalPaginas}`;
    pdf.text(textoPagina, larguraPagina - margem, alturaPagina - margem - 2.2, { align: 'right' });
}

function gerarPDF() {
    if (!window.jspdf || !window.html2canvas) {
        mostrarToast('Aguarde o carregamento das bibliotecas...', 'erro');
        return;
    }

    const elemento = document.getElementById('printArea');
    if (!elemento || !elemento.innerHTML.trim()) {
        mostrarToast('Nenhum conteúdo para exportar.', 'erro');
        return;
    }

    const botaoPDF = document.querySelector('#modalRelatorio [data-action="gerarPDF"]');
    const textoOriginalBotao = botaoPDF ? botaoPDF.innerHTML : '';
    if (botaoPDF) {
        botaoPDF.disabled = true;
        botaoPDF.innerHTML = '<i class="bi bi-hourglass-split"></i> Gerando...';
    }

    const { jsPDF } = window.jspdf;
    const tituloDoc = (document.querySelector('#printArea h1, #printArea h2')?.textContent || 'Documento MTZ').trim();
    const dataGeracao = new Date().toLocaleString('pt-BR');
    const opcoesCanvas = {
        scale: Math.min(window.devicePixelRatio || 2, 2),
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        scrollX: 0,
        scrollY: -window.scrollY,
        windowWidth: document.documentElement.scrollWidth
    };

    html2canvas(elemento, opcoesCanvas)
        .then(canvas => {
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const margem = 6;
            const alturaCabecalho = 8;
            const alturaRodape = 8;
            const larguraPagina = pdf.internal.pageSize.getWidth();
            const alturaPagina = pdf.internal.pageSize.getHeight();
            const larguraUtil = larguraPagina - (margem * 2);
            const topoConteudo = margem + alturaCabecalho;
            const alturaUtil = alturaPagina - (margem * 2) - alturaCabecalho - alturaRodape;
            const imgLargura = larguraUtil;
            const imgAltura = (canvas.height * imgLargura) / canvas.width;

            let alturaRestante = imgAltura;
            let posicaoY = topoConteudo;

            pdf.addImage(imgData, 'PNG', margem, posicaoY, imgLargura, imgAltura, undefined, 'FAST');
            alturaRestante -= alturaUtil;

            while (alturaRestante > 0.01) {
                pdf.addPage();
                posicaoY = topoConteudo - (imgAltura - alturaRestante);
                pdf.addImage(imgData, 'PNG', margem, posicaoY, imgLargura, imgAltura, undefined, 'FAST');
                alturaRestante -= alturaUtil;
            }

            const totalPaginas = pdf.getNumberOfPages();
            for (let pagina = 1; pagina <= totalPaginas; pagina += 1) {
                pdf.setPage(pagina);
                aplicarCabecalhoRodapePDF(pdf, pagina, totalPaginas, tituloDoc, dataGeracao, margem, alturaCabecalho, alturaRodape);
            }

            pdf.save(gerarNomeArquivoPDF());
            mostrarToast('PDF gerado com sucesso!', 'ok');
        })
        .catch(() => {
            mostrarToast('Erro ao gerar PDF. Tente novamente.', 'erro');
        })
        .finally(() => {
            if (botaoPDF) {
                botaoPDF.disabled = false;
                botaoPDF.innerHTML = textoOriginalBotao || '<i class="bi bi-printer"></i> Salvar PDF';
            }
        });
}
