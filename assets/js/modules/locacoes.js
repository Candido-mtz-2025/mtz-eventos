// Busca inteligente e operações de locação
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

    function formatarMoedaBR(valor) {
        return (Number(valor) || 0).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        });
    }

    function escaparHTML(valor) {
        const div = document.createElement('div');
        div.textContent = valor ?? '';
        return div.innerHTML;
    }

    function calcularTotalCarrinhoLocacao() {
        return carrinhoLocacao.reduce((total, item) => {
            return total + ((parseFloat(item.valor) || 0) * (parseInt(item.quantidade) || 0));
        }, 0);
    }

    function renderCarrinhoLocacao() {
        const lista = document.getElementById('carrinhoList');
        const total = document.getElementById('checkoutTotalLocacao');
        const btnFinalizar = document.getElementById('btnFinalizarLocacao');
        const btnLimpar = document.getElementById('btnLimparCarrinho');

        if (!lista) return;

        if (carrinhoLocacao.length === 0) {
            lista.innerHTML = '<i><i class="bi bi-info-circle"></i> Nenhum item adicionado à lista.</i>';
        } else {
            lista.innerHTML = carrinhoLocacao.map((item, index) => {
                const valor = parseFloat(item.valor) || 0;
                const quantidade = parseInt(item.quantidade) || 0;
                const totalItem = valor * quantidade;

                return `
                    <div class="item-carrinho">
                        <div class="item-carrinho-main">
                            <span><b>${quantidade}x</b> ${escaparHTML(item.nome)}</span>
                            <span class="item-carrinho-meta">${formatarMoedaBR(valor)} por item</span>
                        </div>
                        <div class="item-carrinho-side">
                            <strong>${formatarMoedaBR(totalItem)}</strong>
                            <button class="btn btn-sm btn-danger btn-icon" onclick="removerItemCarrinho(${index})" title="Remover item">
                                <i class="bi bi-x-lg"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        if (total) total.innerText = formatarMoedaBR(calcularTotalCarrinhoLocacao());
        if (btnFinalizar) btnFinalizar.disabled = carrinhoLocacao.length === 0;
        if (btnLimpar) btnLimpar.disabled = carrinhoLocacao.length === 0;
    }

    function removerItemCarrinho(index) {
        carrinhoLocacao.splice(index, 1);
        renderCarrinhoLocacao();
    }

    function limparCarrinhoLocacao() {
        if (carrinhoLocacao.length === 0) return;
        confirmarAcao('Limpar todos os itens do pedido?', () => {
            carrinhoLocacao = [];
            renderCarrinhoLocacao();
            mostrarToast('Pedido limpo.');
        }, {
            titulo: 'Limpar pedido',
            textoConfirmar: 'Limpar',
            classeConfirmar: 'btn-danger'
        });
    }

    // --- NOVA FUNÇÃO DE ADICIONAR AO CARRINHO (RESTAURADA) ---
    function addItemCarrinho() { 
        // 1. Pega o ID do input oculto
        var id = document.getElementById('aluguelItemSelect').value;
        if (!id) return mostrarToast("Busque e selecione um item!", "erro"); 
        
        // 2. Trata a quantidade
        var campoQtd = document.getElementById('aluguelQtd');
        var qtd = parseInt(campoQtd?.value, 10);
        if (!Number.isInteger(qtd) || qtd < 1) {
            mostrarToast("Informe uma quantidade valida (minimo 1).", "erro");
            if (campoQtd) campoQtd.focus();
            return;
        }

        // 3. Busca a peça
        var p = pecas.find(function(x) { return x.id == id; });
        if (!p) return mostrarToast("Item nao encontrado.", "erro");
        if ((parseInt(p.disponivel, 10) || 0) <= 0) {
            mostrarToast("Esse item esta sem estoque disponivel.", "erro");
            return;
        }

        // --- TRAVA DE ESTOQUE ---
        var itemNoCarrinho = carrinhoLocacao.find(x => x.pecaId == p.id);
        var qtdJaNoCarrinho = itemNoCarrinho ? itemNoCarrinho.quantidade : 0;
        var qtdTotalSolicitada = qtd + qtdJaNoCarrinho;

        if (qtdTotalSolicitada > p.disponivel) {
            if (campoQtd) campoQtd.value = String(Math.max((parseInt(p.disponivel, 10) || 1) - qtdJaNoCarrinho, 1));
            return mostrarToast(`Estoque insuficiente! Só restam ${p.disponivel}.`, "erro");
        }

        // 4. Adiciona ao carrinho
        if (itemNoCarrinho) {
            itemNoCarrinho.quantidade += qtd;
        } else {
            carrinhoLocacao.push({
                pecaId: p.id, 
                nome: p.nome, 
                valor: parseFloat(p.valor) || 0,
                quantidade: qtd
            });
        }

        renderCarrinhoLocacao();
        mostrarToast("Item adicionado!");

        // 6. LIMPA E FOCA PARA O PRÓXIMO
        document.getElementById('inputBuscaPeca').value = ""; 
        document.getElementById('aluguelItemSelect').value = ""; 
        document.getElementById('aluguelQtd').value = "1";
        document.getElementById('avisoEstoque').innerText = "";
        document.getElementById('inputBuscaPeca').focus();
    }

    // --- FINALIZAR LOCAÇÃO ---
    function finalizarLocacao() { 
        var cli = document.getElementById('aluguelCliente').value;
        var ini = document.getElementById('aluguelIni').value; 
        var fim = document.getElementById('aluguelFim').value;

        // LÊ O DIVISOR DO CAMPO
        var divInput = parseFloat(document.getElementById('aluguelDivisor').value);
        if(isNaN(divInput) || divInput <= 0) divInput = 1;

        if (!cli || carrinhoLocacao.length === 0) {
            mostrarToast("Preencha cliente e itens!", "erro");
            return;
        }

        const cliente = locadores.find(x => String(x.id) === String(cli));
        if (!cliente) {
            mostrarToast("Cliente selecionado e invalido.", "erro");
            return;
        }

        if (!ini || !fim) {
            mostrarToast("Informe as datas da locação.", "erro");
            return;
        }

        const dataInicio = new Date(`${ini}T00:00:00`);
        const dataFim = new Date(`${fim}T00:00:00`);
        if (Number.isNaN(dataInicio.getTime()) || Number.isNaN(dataFim.getTime())) {
            mostrarToast("Datas invalidas. Confira inicio e fim.", "erro");
            return;
        }

        if (dataFim < dataInicio) {
            mostrarToast("A previsão de fim não pode ser antes do início.", "erro");
            return;
        }

        if (!Number.isFinite(divInput) || divInput <= 0) {
            mostrarToast("Divisor invalido. Informe um valor acima de zero.", "erro");
            return;
        }

        const itensInvalidos = carrinhoLocacao.filter(item => {
            const qtd = parseInt(item.quantidade, 10);
            const valor = parseFloat(item.valor);
            return !Number.isInteger(qtd) || qtd < 1 || !Number.isFinite(valor) || valor < 0;
        });

        if (itensInvalidos.length > 0) {
            mostrarToast("Existem itens com quantidade/valor invalido no pedido.", "erro");
            return;
        }

        var itensParaSalvar = carrinhoLocacao.map(item => ({ ...item }));

        locacoes.push({
            id: Date.now(), 
            locadorId: parseInt(cli), 
            dataAluguel: ini, 
            dataDevolucaoPrevisao: fim, 
            items: itensParaSalvar, 
            status: 'ativo', 
            divisorFatura: divInput
        });

        carrinhoLocacao = [];
        document.getElementById('aluguelCliente').value = ""; 
        document.getElementById('aluguelItemSelect').value = ""; 
        document.getElementById('aluguelQtd').value = "1";
        renderCarrinhoLocacao();
        
        if(typeof recalcularDisponibilidade === 'function') recalcularDisponibilidade(true);
        salvarLocal();
        renderTudo();
        
        // Registra no log de auditoria
        registrarLog('locacao', 'criar', `Locação criada: ${cliente?.nome || 'Cliente'} - ${itensParaSalvar.length} itens`);
        
        mostrarToast("Locação Concluída!");
        sincronizar('salvar');
    }

    function cancelarLocacao(id) {
        confirmarAcao("Cancelar locação?", () => {
            locacoes = locacoes.filter(l => l.id !== id);
            if(typeof recalcularDisponibilidade === 'function') recalcularDisponibilidade(true);
            salvarLocal();
            renderTudo();
            sincronizar('salvar');
            mostrarToast("Locacao cancelada.");
        }, {
            titulo: "Cancelar locacao",
            textoConfirmar: "Cancelar locacao",
            classeConfirmar: "btn-danger"
        });
    }
    function mudarFiltro(n) { filtroAtual = n; renderLocacoes(); }
    function irParaLocacoes(f) { abrirTab('locacoes'); setTimeout(() => mudarFiltro(f), 100); }
    function alternarPagamento(id) { const l = locacoes.find(x => x.id == id); if(l) { l.pago = !l.pago; salvarLocal(); renderLocacoes(); renderStats(); sincronizar('salvar'); mostrarToast("Pagamento atualizado!"); } }

        // --- FUNÇÕES DE TRAVA DE ESTOQUE ---
    function atualizarLimiteEstoque() {
        var select = document.getElementById('aluguelItemSelect');
        var inputQtd = document.getElementById('aluguelQtd');
        var aviso = document.getElementById('avisoEstoque');
        
        var id = select.value;
        var p = pecas.find(x => x.id == id);

        if (p) {
            inputQtd.max = p.disponivel; // Define o máximo
            inputQtd.value = 1; 
            aviso.innerText = `(Máx: ${p.disponivel})`; // Mostra o aviso vermelho
        } else {
            aviso.innerText = "";
            inputQtd.removeAttribute("max");
        }
    }

    function validarDigitacao(input) {
        var maximo = parseInt(input.max);
        var valorDigitado = parseInt(input.value);

        if (!isNaN(maximo) && valorDigitado > maximo) {
            input.value = maximo; // Se passar, volta pro máximo
            mostrarToast("Limite de estoque atingido!", "erro");
        }
        if (valorDigitado < 1) input.value = 1;
    }

    window.renderCarrinhoLocacao = renderCarrinhoLocacao;
    window.removerItemCarrinho = removerItemCarrinho;
    window.limparCarrinhoLocacao = limparCarrinhoLocacao;
