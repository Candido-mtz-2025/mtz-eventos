// ========================================
// 🔥 CACHE DE DOM - OTIMIZAÇÃO V11.1
// ========================================
const DOM = {
    _cache: {},
    get(id) {
        if (!this._cache[id]) {
            this._cache[id] = document.getElementById(id);
            if (!this._cache[id]) {
                console.warn(`⚠️ Elemento #${id} não encontrado`);
            }
        }
        return this._cache[id];
    }
};

// === SISTEMA MTZ EVENTOS (V11 FINAL CORRIGIDA) ===
let locadores = [], pecas = [], locacoes = [], devolucoes = [], tipos = [], carrinhoLocacao = [];

    let logsAuditoria = []; // NOVO: Sistema de auditoria
    let config = { rodape: "MTZ Eventos", tel: "", email: "", logo: "" };
    let tokenClient, filtroAtual = 'todos';
    let paginaAtual = {
    locadores: 1,
    pecas: 1,
    locacoes: 1
    };
    const ITENS_POR_PAGINA = 50;
    
function filtrarItensLocacao() {
    const termoInput = document.getElementById('inputBuscaPeca');
    const lista = document.getElementById('listaSugestoes');
    if (!termoInput || !lista) return;

    const normalizar = (t) => t ? t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";
    const termo = normalizar(termoInput.value);
    
    lista.innerHTML = '';
    if (termo.length < 1) { // Busca a partir da 1ª letra 
        lista.classList.remove('ativo');
        return;
    }

   const termos = termo.split(/\s+/).filter(Boolean);

const scorePeca = (p) => {
  const nome = normalizar(p.nome);
  const codigo = normalizar(p.codigo);
  const medida = normalizar(p.medida);
  const tipo = tipos.find(t => t.id === p.tipoId);
  const categoria = tipo ? normalizar(tipo.nome) : '';

  // junta tudo numa frase pra pesquisar
  const alvo = `${nome} ${codigo} ${categoria} ${medida}`.trim();

  // precisa bater TODOS os termos digitados
  const ok = termos.every(t => alvo.includes(t));
  if (!ok) return -1;

  // ranking (quanto maior, melhor)
  let score = 0;

  // prioridade forte: começa com o termo inteiro
  if (nome.startsWith(termo)) score += 100;
  if (codigo.startsWith(termo)) score += 90;

  // depois: contém o termo inteiro
  if (nome.includes(termo)) score += 60;
  if (codigo.includes(termo)) score += 50;

  // bônus: termos individuais começando
  termos.forEach(t => {
    if (nome.startsWith(t)) score += 15;
    if (codigo.startsWith(t)) score += 10;
  });

  // bônus: tem estoque
  score += (p.disponivel > 0 ? 5 : 0);

  return score;
};

const filtrados = pecas
  .map(p => ({ p, s: scorePeca(p) }))
  .filter(x => x.s >= 0)
  .sort((a,b) => b.s - a.s)
  .slice(0, 20)   // limita pra não pesar
  .map(x => x.p);

    if (filtrados.length === 0) {
        lista.innerHTML = '<div class="sugestao-item"><span>Nenhum item encontrado</span></div>';
        lista.classList.add('ativo');
        return;
    }

    filtrados.forEach(p => {
        const item = document.createElement('div');
        item.className = 'sugestao-item';
        item.innerHTML = `<span>${p.nome} <small style="opacity:0.6">[${p.codigo}]</small></span>
                          <span class="sugestao-estoque">(Disp: ${p.disponivel})</span>`;
        item.onclick = function() {
            document.getElementById('inputBuscaPeca').value = p.nome;
            document.getElementById('aluguelItemSelect').value = p.id;
            document.getElementById('aluguelQtd').focus();
            if(typeof atualizarLimiteEstoque === 'function') atualizarLimiteEstoque();
            lista.classList.remove('ativo');
        };
        lista.appendChild(item);
    });
    lista.classList.add('ativo');
}
// === RENDERIZAÇÃO GERAL (GARANTE QUE AS ABAS CARREGUEM) ===
function renderTudo() {
    if(typeof renderLocacoes === 'function') renderLocacoes();
    if(typeof renderLocadores === 'function') renderLocadores();
    if(typeof renderEstoque === 'function') renderEstoque();
    if(typeof renderDevolucoes === 'function') renderDevolucoes();
    if(typeof renderTipos === 'function') renderTipos();
    if(typeof renderStats === 'function') renderStats();
    if(typeof updateSelects === 'function') updateSelects();
    if(typeof renderLogs === 'function') renderLogs();
    if(typeof renderConfig === 'function') renderConfig();
}
    // Cache para otimizar buscas
    let cacheDisponibilidade = null;
    let ultimaAtualizacaoCache = 0;

    // === DEBOUNCE: EVITA LAG AO DIGITAR ===
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

// === BUSCA COM DEBOUNCE (ANTI-LAG) ===
const buscarComDebounce = debounce(function(tipo) {
    if (tipo === 'locadores') renderLocadores();
    if (tipo === 'estoque') renderEstoque();
}, 300);

function registrarLog(tipo, acao, descricao, dados = null) {
    const log = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        data: new Date().toLocaleString('pt-BR'),
        tipo: tipo,        // 'cliente', 'item', 'locacao', 'devolucao', 'config', 'sistema'
        acao: acao,        // 'criar', 'editar', 'deletar', 'visualizar', 'exportar'
        descricao: descricao,
        usuario: localStorage.getItem('usuarioEmail') || 'Offline',
        dados: dados       // Dados relevantes da ação
    };
    
    logsAuditoria.unshift(log); // Adiciona no início
    
    // Limita a 1000 logs (mantém últimos 3 meses aprox.)
    if (logsAuditoria.length > 1000) {
        logsAuditoria = logsAuditoria.slice(0, 1000);
    }
    
    console.log('📝 LOG:', log.tipo, '→', log.acao, '→', log.descricao);
}

/**
 * Limpa logs antigos (mais de 90 dias)
 */
function limparLogsAntigos() {
    const treseMesesAtras = Date.now() - (90 * 24 * 60 * 60 * 1000);
    const qtdAntes = logsAuditoria.length;
    
    logsAuditoria = logsAuditoria.filter(log => log.id > treseMesesAtras);
    
    const removidos = qtdAntes - logsAuditoria.length;
    if (removidos > 0) {
        console.log(`🗑️ ${removidos} logs antigos removidos`);
        registrarLog('sistema', 'limpeza', `${removidos} logs antigos removidos`);
    }
    
    salvarLocal();
}

/**
 * Exporta logs como CSV
 */
function exportarLogsCSV() {
    if (logsAuditoria.length === 0) {
        mostrarToast('Nenhum log para exportar!', 'erro');
        return;
    }
    
    let csv = 'Data,Hora,Tipo,Ação,Descrição,Usuário\n';
    
    logsAuditoria.forEach(log => {
        const data = new Date(log.timestamp);
        const dataStr = data.toLocaleDateString('pt-BR');
        const horaStr = data.toLocaleTimeString('pt-BR');
        
        csv += `"${dataStr}","${horaStr}","${log.tipo}","${log.acao}","${log.descricao}","${log.usuario}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MTZ-Auditoria-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    registrarLog('sistema', 'exportar', 'Logs de auditoria exportados');
    mostrarToast('Logs exportados com sucesso!');
}

/**
 * Renderiza a tabela de logs
 */
function renderLogs(filtro = 'todos') {
  const tbody = document.getElementById('tblLogs');
  if (!tbody) return;

  // (opcional) ativa botão
  document.querySelectorAll('.audit-filter').forEach(b => b.classList.remove('active'));
  const btnAtivo = document.querySelector(`.audit-filter[data-filter="${filtro}"]`);
  if (btnAtivo) btnAtivo.classList.add('active');

  let logsFiltrados = logsAuditoria;
  if (filtro !== 'todos') {
    logsFiltrados = logsAuditoria.filter(log => log.tipo === filtro);
  }
    const icones = {
        'cliente': 'bi-person',
        'item': 'bi-box',
        'locacao': 'bi-cart',
        'devolucao': 'bi-arrow-return-left',
        'config': 'bi-gear',
        'sistema': 'bi-cpu'
    };
    
    const cores = {
        'criar': '#10b981',
        'editar': '#f59e0b',
        'deletar': '#ef4444',
        'visualizar': '#0ea5e9',
        'exportar': '#8b5cf6'
    };
    
    tbody.innerHTML = logsFiltrados.slice(0, 100).map(log => {
        const data = new Date(log.timestamp);
        const dataStr = data.toLocaleDateString('pt-BR');
        const horaStr = data.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
        
        return `
            <tr>
                <td>
                    <div style="font-size:0.85rem; line-height:1.4">${dataStr}</div>
                    <div style="font-size:0.75rem; opacity:0.7">${horaStr}</div>
                </td>
                <td>
                    <i class="bi ${icones[log.tipo] || 'bi-circle'}" style="color:var(--primary); margin-right:4px"></i>
                    <span style="font-size:0.85rem">${log.tipo}</span>
                </td>
                <td>
                    <span style="color:${cores[log.acao]}; font-weight:600; font-size:0.85rem">${log.acao}</span>
                </td>
                <td style="max-width:400px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">
                    ${log.descricao}
                </td>
                <td style="font-size:0.85rem; opacity:0.8">${log.usuario}</td>
            </tr>
        `;
    }).join('');
}

const GOOGLE_CLIENT_ID = '981345912804-uim8kctqnts15kt6l8odhif3hil6udek.apps.googleusercontent.com';
const API_URL = 'https://script.google.com/macros/s/AKfycbxZoCyJZrG2WZfIuPA3Iyz6d-PIdnzFi-Ejnl3gAUB-l9mGnBJt0BpyBErzMI_GFuZuhA/exec';
    
    // --- FORMATAÇÃO DE DATA ---
    function formatarData(dataString) {
        if (!dataString) return '<span style="color:#999">---</span>';
        const data = new Date(dataString);
        if (isNaN(data.getTime())) return '<span>Em aberto</span>';
        const dataCorrigida = new Date(data.getTime() + data.getTimezoneOffset() * 60000);
        return dataCorrigida.toLocaleDateString('pt-BR');
    }

    // --- INICIALIZAÇÃO ---
    window.onload = function() {
        carregarLocal();
        const hoje = new Date().toISOString().split('T')[0];
        const elIni = document.getElementById('aluguelIni');
        const elDev = document.getElementById('devData');
        if(elIni) elIni.value = hoje;
        if(elDev) elDev.value = hoje;

        // INJEÇÃO DE ESTILO FORÇADO PARA O PDF FICAR PERFEITO
        const style = document.createElement('style');
        style.innerHTML = `
            @media print { @page { margin: 0; } body { background: white; } }
            
           /* CONFIGURAÇÃO DA FOLHA A4 CHEIA */
            #printArea { 
                position: relative !important; /* IMPORTANTE: Segura o rodapé no lugar */
                background-color: #ffffff !important;
                color: #000000 !important; 
                box-shadow: none !important; 
                margin: 0 auto !important; 
                width: 100% !important;
                /* Padding inferior maior (30mm) para o texto não ficar atrás da barra preta */
                padding: 15mm 15mm 30mm 15mm !important; 
                min-height: 297mm !important; /* Força altura total A4 */
                display: flex;
                flex-direction: column;
            }
            #printArea * { color: #000000 !important; border-color: #000000 !important; }
            #printArea thead { background-color: #000000 !important; }
            #printArea thead th { color: #ffffff !important; background-color: #000000 !important; }
            #printArea .footer-bar, #printArea .footer-bar div { background-color: #000000 !important; color: #ffffff !important; }
        `;
        document.head.appendChild(style);
        
        if(localStorage.getItem('theme') === 'dark') document.body.setAttribute('data-theme', 'dark');
        if(window.google) gisLoaded();
        if(localStorage.getItem('gToken')) { entrarApp(); sincronizar('carregar'); }
        iniciarBackupAutomatico();
        setInterval(salvarLocal, 60000); // Auto-salva a cada 1 minuto
        console.log('✅ Sistema de backup ativado');
    };

    function toggleTheme() { 
        const body = document.body;
        const isDark = body.getAttribute('data-theme') === 'dark'; 
        body.setAttribute('data-theme', isDark ? 'light' : 'dark'); 
        localStorage.setItem('theme', isDark ? 'light' : 'dark');
    }

    function abrirTab(id) { 
        document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(x => x.classList.remove('active')); 
        const tab = document.getElementById('tab-'+id);
        if(tab) tab.classList.add('active'); 
        const btns = document.querySelectorAll('.tab-btn');
        btns.forEach(btn => { if(btn.getAttribute('onclick').includes(id)) btn.classList.add('active'); });
    }
    
    function fecharModal(id) { const m = document.getElementById(id); if(m) m.classList.remove('active'); }

