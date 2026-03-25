// Clientes: cadastro e edição
    function salvarLocador() { const n=document.getElementById('locNome').value; if(!n) return; locadores.push({id:Date.now(), nome:n, email:document.getElementById('locEmail').value, telefone:document.getElementById('locTel').value, documento:document.getElementById('locDoc').value}); salvarLocal(); renderTudo(); sincronizar('salvar'); document.getElementById('locNome').value=""; mostrarToast("Cliente Salvo!"); }

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
