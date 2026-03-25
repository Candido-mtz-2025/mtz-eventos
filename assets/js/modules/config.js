// Configurações gerais
    function salvarConfig() { const elRodape = document.getElementById('confRodape'); const elTel = document.getElementById('confTel'); const elEmail = document.getElementById('confEmail'); if(elRodape) config.rodape = elRodape.value; if(elTel) config.tel = elTel.value; if(elEmail) config.email = elEmail.value; salvarLocal(); sincronizar('salvar'); mostrarToast("Config salva!"); }

    function converterLogo() { const input = document.getElementById('confLogo'); if (input.files[0]) { const reader = new FileReader();
    reader.onloadend = function() { config.logo = reader.result; document.getElementById('previewLogo').innerHTML = `<img src="${config.logo}" style="height:50px">`; }; reader.readAsDataURL(input.files[0]); } }
