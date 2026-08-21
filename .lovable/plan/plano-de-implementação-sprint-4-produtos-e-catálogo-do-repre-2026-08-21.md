# Plano de Implementação - Sprint 4: Produtos e Catálogo do Representante

Este plano detalha a implementação do catálogo de produtos para o módulo de Representantes, permitindo a alternância entre visualizações, filtros avançados e um sistema de carrinho aprimorado.

## Alterações Técnicas

### Banco de Dados (Backend)
- Garantir que `price_list_items` suporte imagens (campo `image_url` se não existir).
- Otimizar a consulta do catálogo para respeitar as tabelas de preços e categorias autorizadas para o representante logado.

### Frontend

#### Componentes e Páginas
- **`RepresentativeCatalog.tsx`**: Refatoração completa para suportar as novas visualizações e funcionalidades.
    - Implementar estado para alternar entre `viewMode` ('gallery' | 'list').
    - Adicionar controles de ordenação (Nome A-Z, Preço crescente/decrescente).
    - Refinar filtros por Categoria, Marca e Subcategoria.
- **`CatalogGalleryView.tsx`** (Novo): Componente para exibição em grade (estilo e-commerce).
- **`CatalogListView.tsx`** (Novo): Componente para exibição em lista (tabela).
- **`RepresentativeCartSide.tsx`** (Novo): Componente de carrinho lateral para desktop e gaveta (drawer) para mobile.

#### Funcionalidades do Carrinho
- Atualizar `useRepresentativeCart` para permitir ajuste de quantidade direto no catálogo/carrinho.
- Sincronização em tempo real com o backend.

## Detalhes de Interface (UI)

### Visualização em Galeria
- Card com Foto, Nome, Código, Categoria, Preço.
- Seletor de quantidade (-/+) e botão "Adicionar".

### Visualização em Lista
- Tabela compacta com as colunas solicitadas.
- Input de quantidade rápido por linha.

### Carrinho
- Desktop: Barra lateral retrátil à direita.
- Mobile: Botão flutuante que abre uma folha (sheet) inferior.

## Próximos Passos
1. Executar migrações pendentes no backend (se houver).
2. Criar os novos sub-componentes de visualização.
3. Atualizar a página principal do catálogo com a lógica de alternância e filtros.
4. Testar a persistência do carrinho e a criação de orçamentos.
