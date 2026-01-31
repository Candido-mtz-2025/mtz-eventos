<?php
// === CONFIGURAÇÕES DE SEGURANÇA ===
// O Client ID deve ser IGUAL ao do seu código JavaScript
$GOOGLE_CLIENT_ID = '981345912804-uim8kctqnts15kt6l8odhif3hil6udek.apps.googleusercontent.com';

// Configuração de CORS (Permitir acesso externo)
header("Access-Control-Allow-Origin: *"); 
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json; charset=UTF-8");

// Se for apenas uma verificação de 'preflight' do navegador, encerra aqui
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Arquivo onde os dados serão salvos
$arquivo_db = 'banco_dados.json';

// === FUNÇÃO PARA VALIDAR TOKEN GOOGLE ===
function validarToken($token, $clientId) {
    if (!$token) return false;

    // Consulta a API do Google para validar o token
    $url = "https://oauth2.googleapis.com/tokeninfo?access_token=" . $token;
    
    // Suprime erros visuais do file_get_contents
    $response = @file_get_contents($url);
    
    if ($response === FALSE) {
        return false; // Token inválido ou expirado
    }

    $data = json_decode($response);

    // Verifica se o token é válido e se foi gerado para O SEU App (evita ataque de token confuso)
    if (isset($data->aud) && $data->aud === $clientId) {
        return true;
    }
    
    // Algumas vezes o ID vem em 'azp' dependendo do escopo
    if (isset($data->azp) && $data->azp === $clientId) {
        return true;
    }

    return false;
}

// Pega a ação e o token da URL
$action = isset($_GET['action']) ? $_GET['action'] : '';
$token = isset($_GET['token']) ? $_GET['token'] : '';

// === BLOQUEIO DE SEGURANÇA ===
// Se tentar ler ou salvar sem token válido, bloqueia.
if (!validarToken($token, $GOOGLE_CLIENT_ID)) {
    http_response_code(401); // Não autorizado
    echo json_encode(["success" => false, "error" => "Token inválido ou expirado. Faça login novamente."]);
    exit;
}

// 1. CARREGAR DADOS
if ($action === 'carregar') {
    if (file_exists($arquivo_db)) {
        $conteudo = file_get_contents($arquivo_db);
        // Retorna o JSON
        echo json_encode([
            "success" => true, 
            "dados" => json_decode($conteudo)
        ]);
    } else {
        echo json_encode([
            "success" => true, 
            "dados" => null, 
            "msg" => "Banco de dados novo"
        ]);
    }
    exit;
}

// 2. SALVAR DADOS
if ($action === 'salvar' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $dados_recebidos = file_get_contents("php://input");
    
    if ($dados_recebidos) {
        $json_test = json_decode($dados_recebidos);
        
        if ($json_test) {
            // LOCK_EX evita que dois usuários salvem ao mesmo tempo e corrompam o arquivo
            file_put_contents($arquivo_db, $dados_recebidos, LOCK_EX);
            echo json_encode(["success" => true, "msg" => "Salvo com sucesso"]);
        } else {
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "JSON invalido"]);
        }
    } else {
        echo json_encode(["success" => false, "error" => "Nenhum dado recebido"]);
    }
    exit;
}

// Rota padrão
echo json_encode(["success" => false, "msg" => "API Segura Online"]);
?>