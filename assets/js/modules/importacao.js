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
