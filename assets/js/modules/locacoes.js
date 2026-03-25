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

    // --- NOVA FUNÇÃO DE ADICIONAR AO CARRINHO (RESTAURADA) ---
    function addItemCarrinho() { 
        // 1. Pega o ID do input oculto
        var id = document.getElementById('aluguelItemSelect').value;
        if (!id) return mostrarToast("Busque e selecione um item!", "erro"); 
        
        // 2. Trata a quantidade
        var qtdInput = document.getElementById('aluguelQtd').value;
        var qtd = parseInt(qtdInput);
        if (isNaN(qtd) || qtd < 1) qtd = 1;

        // 3. Busca a peça
        var p = pecas.find(function(x) { return x.id == id; });
        if (!p) return;

        // --- TRAVA DE ESTOQUE ---
        var itemNoCarrinho = carrinhoLocacao.find(x => x.pecaId == p.id);
        var qtdJaNoCarrinho = itemNoCarrinho ? itemNoCarrinho.quantidade : 0;
        var qtdTotalSolicitada = qtd + qtdJaNoCarrinho;

        if (qtdTotalSolicitada > p.disponivel) {
            return mostrarToast(`Estoque insuficiente! Só restam ${p.disponivel}.`, "erro");
        }

        // 4. Adiciona ao carrinho
        if (itemNoCarrinho) {
            itemNoCarrinho.quantidade += qtd;
        } else {
            carrinhoLocacao.push({
                pecaId: p.id, 
                nome: p.nome, 
                valor: parseFloat(p.valor), 
                quantidade: qtd
            });
        }
        
        // 5. Gera HTML
        var htmlLista = '';
        for (var i = 0; i < carrinhoLocacao.length; i++) {
            var item = carrinhoLocacao[i];
            var totalItem = (item.valor * item.quantidade).toFixed(2);
            htmlLista += '<div class="item-carrinho">';
            htmlLista += '<span><b>' + item.quantidade + 'x</b> ' + item.nome + '</span>';
            htmlLista += '<span style="font-weight:600">R$ ' + totalItem + '</span>';
            htmlLista += '</div>';
        }

        document.getElementById('carrinhoList').innerHTML = htmlLista;
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
        
        var itensParaSalvar = [];
        for (var i = 0; i < carrinhoLocacao.length; i++) { 
            itensParaSalvar.push(carrinhoLocacao[i]); 
        }

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
        document.getElementById('carrinhoList').innerHTML = '<i><i class="bi bi-info-circle"></i> Nenhum item adicionado à lista.</i>';
        document.getElementById('aluguelCliente').value = ""; 
        document.getElementById('aluguelItemSelect').value = ""; 
        document.getElementById('aluguelQtd').value = "1";
        
        salvarLocal();
        renderTudo();
        
        // Registra no log de auditoria
        const cliente = locadores.find(x => x.id === parseInt(cli));
        registrarLog('locacao', 'criar', `Locação criada: ${cliente?.nome || 'Cliente'} - ${itensParaSalvar.length} itens`);
        
        mostrarToast("Locação Concluída!");
        sincronizar('salvar');
    }

    function cancelarLocacao(id) { if(!confirm("Cancelar locação?")) return; locacoes=locacoes.filter(l=>l.id!==id); salvarLocal(); renderTudo(); sincronizar('salvar'); }
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
