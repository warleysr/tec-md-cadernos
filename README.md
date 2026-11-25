# TEC MD Cadernos

Sistema local para importar cadernos de questões em Markdown (`.md`, incluindo saídas do Docling/TEC Concursos) e resolver questões com interface e atalhos inspirados no TEC Concursos.

## Funcionalidades

- Importação de arquivos `.md` (drag-and-drop, seleção de arquivo ou arquivos `.md` do workspace).
- Suporte a questões de **Múltipla Escolha** (`A`–`E`) e **Certo / Errado** (`C` / `E`).
- Renderização de tabelas Markdown, blocos de código e imagens base64.
- Persistência local em `data/db.json` (resoluções, acertos, erros, histórico, anotações pessoais, alternativas riscadas e questões removidas).
- Estatísticas globais filtráveis **Por Dia**, **Por Semana** e **Total**, com detalhamento por matéria e banca.

## Atalhos de Teclado

| Tecla | Ação |
| --- | --- |
| `L` | Questão aleatória não resolvida |
| `N` | Próxima questão não resolvida |
| `→` / `←` | Questão seguinte / anterior |
| `P` | Ir para questão específica |
| `A`–`E` ou `1`–`5` | Selecionar alternativa (2x risca/elimina) |
| `C` / `E` | Selecionar Certo / Errado (2x risca/elimina) |
| `Enter` | Responder / Confirmar |
| `I` | Aba Informações |
| `O` | Aba Minhas Anotações |
| `R` | Remover / Restaurar questão do caderno |
| `?` | Ajuda de atalhos |

## Como executar

```bash
npm install
npm start
```

Acesse `http://localhost:3456`.
